"""
story_llm.py — LLM-based branching story generation using designer templates.

Reads designer HTML templates as reference, then asks LLM to generate
a completely NEW story following the same structure and quality.
"""

import json
import os
import re
from typing import Optional

# ---- Debug: last raw LLM response (for diagnosis) ----
LAST_RAW_RESPONSE = {"prompt": "", "response": None, "error": None}

# ============================================================
# Import config
# ============================================================
try:
    from config import (
        DEEPSEEK_API_KEY, API_BASE_URL, MODEL_NAME,
        TEMPERATURE, MAX_TOKENS
    )
except ImportError:
    DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
    API_BASE_URL = "https://api.deepseek.com/v1"
    MODEL_NAME = "deepseek-chat"
    TEMPERATURE = 0.85
    MAX_TOKENS = 600


# ============================================================
# Template paths for all 8 story types
# ============================================================

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_TEMPLATE_DIR = os.path.join(_BASE_DIR, 'story_templates')

TEMPLATE_PATHS = {
    "Adventure": os.path.join(_TEMPLATE_DIR, '探险(Adventure)模板.html'),
    "Survival": os.path.join(_TEMPLATE_DIR, '荒野求生(Survival)模板.html'),
    "SciFi": os.path.join(_TEMPLATE_DIR, '科幻(SciFi)模板.html'),
    "Mystery": os.path.join(_TEMPLATE_DIR, '侦探推理(Mystery)模板.html'),
    "FairyTale": os.path.join(_TEMPLATE_DIR, '童话城堡(FairyTale)模板.html'),
    "MagicSchool": os.path.join(_TEMPLATE_DIR, '魔法学院(MagicSchool)模板.html'),
    "Animal": os.path.join(_TEMPLATE_DIR, '动物伙伴(Animal)模板.html'),
    "School": os.path.join(_TEMPLATE_DIR, '校园成长(School)模板.html'),
}

# Frontend type IDs (lowercase) → backend keys (PascalCase)
TYPE_ALIASES = {
    "adventure": "Adventure",
    "survival": "Survival",
    "scifi": "SciFi",
    "mystery": "Mystery",
    "fairytale": "FairyTale",
    "magicschool": "MagicSchool",
    "animal": "Animal",
    "school": "School",
}


# ============================================================
# Core: call LLM API
# ============================================================

def _log(msg):
    """Log to file for debugging"""
    import datetime
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server_debug.log")
    with open(path, "a", encoding="utf-8") as f:
        f.write(f"[{datetime.datetime.now()}] [LLM] {msg}\n")

def call_llm_api(messages: list, max_tokens: int = None) -> Optional[str]:
    """Call the LLM API (OpenAI-compatible format). Returns text or None."""
    if not DEEPSEEK_API_KEY:
        print("    [LLM] WARNING: API key not configured")
        _log("API key not configured")
        return None

    import urllib.request
    import urllib.error
    import time

    LAST_RAW_RESPONSE["prompt"] = messages[0]["content"][:200] + " | " + messages[1]["content"][:200]

    payload = json.dumps({
        "model": MODEL_NAME,
        "messages": messages,
        "temperature": TEMPERATURE,
        "max_tokens": max_tokens or MAX_TOKENS,
    }).encode("utf-8")

    url = f"{API_BASE_URL.rstrip('/')}/chat/completions"

    _log(f"Calling API: url={url} model={MODEL_NAME} max_tokens={max_tokens or MAX_TOKENS}")

    max_attempts = 3
    for attempt in range(1, max_attempts + 1):
        t0 = time.time()
        try:
            req = urllib.request.Request(url, data=payload, headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                "Connection": "close",
            })
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                raw = result["choices"][0]["message"]["content"].strip()
                elapsed = time.time() - t0
                _log(f"API success: {len(raw)} chars in {elapsed:.1f}s (attempt {attempt})")
                LAST_RAW_RESPONSE["response"] = raw
                LAST_RAW_RESPONSE["error"] = None
                return raw
        except urllib.error.HTTPError as e:
            elapsed = time.time() - t0
            if e.code == 429:
                wait = attempt * 3
                _log(f"Rate limited (429), waiting {wait}s before retry {attempt}")
                time.sleep(wait)
                continue
            if e.code == 401:
                _log(f"Auth error (401): API key rejected")
                LAST_RAW_RESPONSE["error"] = "HTTP 401: API key invalid"
                return None
            _log(f"HTTP error {e.code}: {e.reason} (attempt {attempt})")
            if attempt < max_attempts:
                time.sleep(attempt * 2)
            else:
                LAST_RAW_RESPONSE["error"] = f"HTTP {e.code}"
        except urllib.error.URLError as e:
            elapsed = time.time() - t0
            _log(f"URL error: {e.reason} (attempt {attempt}) after {elapsed:.1f}s")
            if attempt < max_attempts:
                time.sleep(attempt * 3)
            else:
                LAST_RAW_RESPONSE["error"] = f"URLError: {e.reason}"
        except Exception as e:
            elapsed = time.time() - t0
            _log(f"API error: {type(e).__name__}: {str(e)[:100]} after {elapsed:.1f}s (attempt {attempt})")
            if attempt < max_attempts and "ConnectionReset" in str(e):
                time.sleep(attempt * 2)
                continue
            if attempt < max_attempts:
                time.sleep(attempt * 2)
            else:
                LAST_RAW_RESPONSE["error"] = f"{type(e).__name__}"

    print(f"    [LLM] All {max_attempts} attempts failed")
    LAST_RAW_RESPONSE["response"] = None
    return None


# ============================================================
# Template reading — parse designer HTML templates
# ============================================================

def _read_template_for_type(story_type: str) -> Optional[dict]:
    """Read the HTML template for the given story type, extract all story data."""
    canonical = TYPE_ALIASES.get(story_type.lower(), story_type)
    path = TEMPLATE_PATHS.get(canonical)
    if not path or not os.path.exists(path):
        print(f"    [TEMPLATE] No template found for {story_type}")
        return None

    try:
        with open(path, 'r', encoding='utf-8') as f:
            html = f.read()
    except Exception as e:
        print(f"    [TEMPLATE] Error reading: {e}")
        return None

    script_match = re.search(r'<script>(.*?)</script>', html, re.DOTALL)
    if not script_match:
        print(f"    [TEMPLATE] No <script> found in {path}")
        return None
    js = script_match.group(1)

    game_title = ""
    gt = re.search(r"var GAME_TITLE='([^']*)'", js)
    if gt:
        game_title = gt.group(1)

    game_type = ""
    gtyp = re.search(r"var GAME_TYPE='([^']*)'", js)
    if gtyp:
        game_type = gtyp.group(1)

    words_match = re.search(r"var WORDS=\[([\s\S]*?)\];", js)
    ref_words = []
    if words_match:
        ref_words = re.findall(r"w:'([^']+)'", words_match.group(1))

    chapters = {}
    chapter_ids = ['start', 'c2a', 'c2b', 'c2c', 'c3', 'c4', 'c5',
                   'c3c', 'c4c', 'c5c', 'e_gold', 'e_silver', 'e_bronze']

    for ch_id in chapter_ids:
        pattern = re.compile(
            r"G\['" + re.escape(ch_id) + r"'\]\s*=\s*(\{[\s\S]*?\})\s*(?:;|G\[')",
            re.DOTALL
        )
        m = pattern.search(js)
        if not m:
            continue

        obj_str = m.group(1)
        entry = {"id": ch_id}

        t = re.search(r"title:'((?:[^'\\]|\\.)*)'", obj_str)
        if t:
            entry["title"] = t.group(1).replace("\\'", "'")

        txt = re.search(r"text:'((?:[^'\\]|\\.)*)'", obj_str)
        if txt:
            entry["text"] = txt.group(1).replace("\\'", "'").replace("<br><br>", "\n\n").replace("<br>", "\n")

        w = re.search(r"words:\[([^\]]*)\]", obj_str)
        if w:
            entry["words"] = re.findall(r"'(\w+)'", w.group(1))

        ch_match = re.search(r"choices:\[([\s\S]*?)\](?:\s*,|\s*\})", obj_str)
        if ch_match:
            choices_raw = ch_match.group(1)
            choice_objs = re.findall(r"\{([^}]+)\}", choices_raw)
            choices = []
            for co in choice_objs:
                ct = re.search(r"t:'((?:[^'\\]|\\.)*)'", co)
                cn = re.search(r"n:'([^']*)'", co)
                if ct:
                    choices.append({
                        "t": ct.group(1).replace("\\'", "'"),
                        "n": cn.group(1) if cn else "end_gold"
                    })
            entry["choices"] = choices

        e_match = re.search(r"e:\s*(true|false)", obj_str)
        if e_match:
            entry["e"] = e_match.group(1) == "true"

        ty = re.search(r"ty:'([^']*)'", obj_str)
        if ty:
            entry["ty"] = ty.group(1)

        badge = re.search(r"badge:'([^']*)'", obj_str)
        if badge:
            entry["badge"] = badge.group(1)

        bbg = re.search(r"bbg:'([^']*)'", obj_str)
        if bbg:
            entry["bbg"] = bbg.group(1)

        tip = re.search(r"tip:'((?:[^'\\]|\\.)*)'", obj_str)
        if tip:
            entry["tip"] = tip.group(1).replace("\\'", "'")

        chapters[ch_id] = entry

    return {
        "title": game_title,
        "type": game_type,
        "words": ref_words,
        "chapters": chapters,
    }


def _build_template_reference(story_type: str) -> Optional[str]:
    """Build a human-readable reference string from the template for the LLM prompt."""
    template = _read_template_for_type(story_type)
    if not template:
        return None

    chapters = template.get("chapters", {})
    start = chapters.get("start", {})
    c2a = chapters.get("c2a", {})
    e_gold = chapters.get("e_gold", {})
    e_silver = chapters.get("e_silver", {})
    e_bronze = chapters.get("e_bronze", {})

    word_list = ", ".join(template.get("words", []))

    ab_chain = []
    for cid in ["c2a", "c3", "c4", "c5"]:
        if cid in chapters:
            ch = chapters[cid]
            ab_chain.append(ch.get("title", cid))
    c_chain = []
    for cid in ["c2c", "c3c", "c4c", "c5c"]:
        if cid in chapters:
            ch = chapters[cid]
            c_chain.append(ch.get("title", cid))

    start_text = start.get("text", "")[:300]
    start_choices = start.get("choices", [])
    start_choices_str = "\n".join(
        f"  {i + 1}. {c['t']}" for i, c in enumerate(start_choices)
    )

    mid_text = ""
    if c2a:
        mid_title = c2a.get("title", "")
        mid_text_body = c2a.get("text", "")[:300]
        mid_choices = c2a.get("choices", [])
        mid_choices_str = "\n".join(
            f"  {i + 1}. {c['t']}" for i, c in enumerate(mid_choices)
        )
        mid_text = f"\n{mid_title}:\n{mid_text_body}\nChoices:\n{mid_choices_str}"

    endings_text = ""
    for ending_id, ending_label in [("e_gold", "Gold Ending"), ("e_silver", "Silver Ending"), ("e_bronze", "Bronze Ending")]:
        if ending_id in chapters:
            ch = chapters[ending_id]
            endings_text += f"\n{ending_label} ({ch.get('title', '')}):\n{ch.get('text', '')[:200]}...\n"

    ref = (
        f"=== REFERENCE {story_type.upper()} STORY ===\n"
        f"Title: {template.get('title', '')}\n"
        f"Words used ({len(template.get('words', []))}): {word_list}\n"
        f"\n"
        f"Chapter structure:\n"
        f"  - Start chapter with 3 choices\n"
        f"  - Branch A/B: {' → '.join(ab_chain)} → Gold/Silver ending\n"
        f"  - Branch C: {' → '.join(c_chain)} → Bronze ending\n"
        f"\n"
        f"Start chapter:\n"
        f"{start.get('title', '')}\n"
        f"{start_text}\n"
        f"Choices:\n{start_choices_str}"
        f"{mid_text}\n"
        f"\n"
        f"Endings:\n{endings_text}\n"
        f"=== END REFERENCE ===\n"
    )
    return ref


# ============================================================
# LLM Prompt construction
# ============================================================

def _build_llm_prompt(story_type: str, level: str, target_words: list) -> list:
    """Build prompt using designer template as reference, asking for a new story."""
    reference = _build_template_reference(story_type)
    if not reference:
        print(f"    [LLM] Could not load reference template for {story_type}")
        return []

    word_list = ", ".join(target_words)

    lv_map = {"L1": "very simple", "L2": "simple", "L3": "intermediate", "L4": "advanced"}
    lv = lv_map.get(level, "simple")

    style_hints = {
        "L1": "Use very short sentences, basic vocabulary, and ~15-30 words per chapter.",
        "L2": "Use simple sentences, common vocabulary, and ~30-60 words per chapter.",
        "L3": "Use varied sentences, intermediate vocabulary, and ~50-100 words per chapter.",
        "L4": "Use complex sentences, advanced vocabulary, and ~80-150 words per chapter.",
    }
    style = style_hints.get(level, style_hints["L2"])

    system = (
        f"You are a children's story writer for English language learners. "
        f"Below is a reference {story_type.lower()} story. "
        f"Study its structure, style, and how it naturally embeds words into the plot.\n"
        f"\n"
        f"{reference}\n"
        f"\n"
        f"Now write a NEW {story_type.lower()} story using THESE words: {word_list}.\n"
        f"Level: {lv}. {style}\n"
        f"\n"
        f"IMPORTANT rules:\n"
        f"1. Write a DIFFERENT plot from the reference, but with the SAME quality.\n"
        f"2. Every chapter must naturally embed some of the user's words using __word__ format.\n"
        f"3. The story MUST have 16 chapters: opening (start), 4 intermediate levels (n1a-n1c, n2a-n2c, n3a-n3c, n4a-n4c), and 3 endings (e_gold, e_silver, e_bronze).\n"
        f"4. The opening chapter (===OPENING===) must have exactly 3 choices. All other non-ending chapters have exactly 2 choices.\n"
        f"5. Endings have no choices.\n"
        f"6. Each non-ending chapter must include a 'words:' line listing which target words appear in it.\n"
        f"7. NEVER mark any word with __word__ that is not in the target word list.\n"
        f"8. Branch structure (5 choices per path):\n"
        f"   opening → n1a, n1b, n1c (3 choices)\n"
        f"   n1a → n2a, n2b | n1b → n2b, n2c | n1c → n2c, n2a\n"
        f"   n2a → n3a, n3b | n2b → n3b, n3c | n2c → n3c, n3a\n"
        f"   n3a → n4a, n4b | n3b → n4b, n4c | n3c → n4c, n4a\n"
        f"   n4a → e_gold, e_silver | n4b → e_silver, e_bronze | n4c → e_bronze, e_bronze\n"
        f"9. The user must make at least 5 choices to reach any ending.\n"
        f"10. BASIC ENGLISH QUALITY: Every sentence must start with a capital letter. Proper nouns (names, places) must be capitalized. Use correct punctuation (periods, commas, apostrophes). No ALL CAPS words unless for emphasis. This is essential for English learners.\n"
    )

    user = (
        f"Generate a complete {story_type.lower()} story using these {len(target_words)} target words:\n"
        f"Words: {word_list}\n"
        f"\n"
        f"Use the EXACT output format below. The story has 5 narrative levels (OPENING + N1 through N4), each level having 3 parallel chapters (A/B/C). Sections must be in order.\n"
        f"\n"
        f"===TITLE===\n"
        f"Story Title\n"
        f"\n"
        f"===OPENING===\n"
        f"Opening story text with __word__ markers naturally embedded...\n"
        f"words: word1, word2\n"
        f"choices:\n"
        f"1. Choice A text → n1a\n"
        f"2. Choice B text → n1b\n"
        f"3. Choice C text → n1c\n"
        f"\n"
        f"===N1A===\n"
        f"N1A story text with __word__ markers...\n"
        f"words: word3\n"
        f"choices:\n"
        f"1. Option → n2a\n"
        f"2. Option → n2b\n"
        f"\n"
        f"===N1B===\n"
        f"N1B story text...\n"
        f"words: word4\n"
        f"choices:\n"
        f"1. Option → n2b\n"
        f"2. Option → n2c\n"
        f"\n"
        f"===N1C===\n"
        f"N1C story text...\n"
        f"words: word5\n"
        f"choices:\n"
        f"1. Option → n2c\n"
        f"2. Option → n2a\n"
        f"\n"
        f"===N2A===\n"
        f"N2A paragraph text with __word__ markers...\n"
        f"words: word6\n"
        f"choices:\n"
        f"1. Option → n3a\n"
        f"2. Option → n3b\n"
        f"\n"
        f"===N2B=== ===N2C=== ===N3A=== ===N3B=== ===N3C===\n"
        f"===N4A=== ===N4B=== ===N4C===\n"
        f"(All these chapters use the SAME format: text → words: → choices: with 2 options each, following the branch structure given in the system message.)\n"
        f"\n"
        f"===ENDING_GOLD===\n"
        f"Gold ending text with __word__ markers...\n"
        f"===ENDING_SILVER===\n"
        f"Silver ending text...\n"
        f"===ENDING_BRONZE===\n"
        f"Bronze ending text...\n"
        f"\n"
        f"Make sure ALL {len(target_words)} target words appear as __word__ across the chapters."
    )

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


# ============================================================
# Parse LLM output into story tree format
# ============================================================

ROUTE_MAP = {
    "start": ["n1a", "n1b", "n1c"],
    "n1a": ["n2a", "n2b"],
    "n1b": ["n2b", "n2c"],
    "n1c": ["n2c", "n2a"],
    "n2a": ["n3a", "n3b"],
    "n2b": ["n3b", "n3c"],
    "n2c": ["n3c", "n3a"],
    "n3a": ["n4a", "n4b"],
    "n3b": ["n4b", "n4c"],
    "n3c": ["n4c", "n4a"],
    "n4a": ["e_gold", "e_silver"],
    "n4b": ["e_silver", "e_bronze"],
    "n4c": ["e_bronze", "e_bronze"],
    "e_gold": [], "e_silver": [], "e_bronze": [],
}

SECTION_MAP = {
    "TITLE": "_title",
    "OPENING": "start",
    "N1A": "n1a", "N1B": "n1b", "N1C": "n1c",
    "N2A": "n2a", "N2B": "n2b", "N2C": "n2c",
    "N3A": "n3a", "N3B": "n3b", "N3C": "n3c",
    "N4A": "n4a", "N4B": "n4b", "N4C": "n4c",
    "ENDING_GOLD": "e_gold",
    "ENDING_SILVER": "e_silver",
    "ENDING_BRONZE": "e_bronze",
}

ENDING_DEFAULTS = {
    "e_gold": {
        "ty": "gold",
        "badge": "⭐ Best Ending",
        "bbg": "linear-gradient(135deg, #ffd700, #ff8c00)",
        "tip": "💡 You made brave choices! Great adventures reward great courage!",
    },
    "e_silver": {
        "ty": "silver",
        "badge": "✨ Good Ending",
        "bbg": "linear-gradient(135deg, #c0c0c0, #7ec8e3)",
        "tip": "💡 A worthy journey! Every step taught you something valuable.",
    },
    "e_bronze": {
        "ty": "bronze",
        "badge": "🌱 Growth Ending",
        "bbg": "linear-gradient(135deg, #cd7f32, #d4a574)",
        "tip": "💡 Every adventure is a chance to learn. You'll be stronger next time!",
    },
}


def _parse_llm_story_output(llm_text: str, target_words: list) -> Optional[dict]:
    """Parse LLM output into {title, chapters} dict matching the story tree format."""

    sections = {}
    current_label = None
    current_lines = []

    for line in llm_text.strip().split('\n'):
        section_match = re.match(r'^={3,}\s*(\w+(?:_\w+)*)\s*={3,}', line)
        if section_match:
            if current_label:
                sections[current_label] = '\n'.join(current_lines).strip()
            current_label = section_match.group(1)
            current_lines = []
        elif current_label:
            current_lines.append(line)

    if current_label:
        sections[current_label] = '\n'.join(current_lines).strip()

    if not sections:
        print("    [PARSE] No sections found in LLM output")
        return None

    title_text = sections.get("TITLE", "").strip()
    title = title_text.replace('__', '').strip()
    if not title:
        title = "A New Story"

    chapters = {}
    chapter_ids_found = set()

    for section_label, chapter_id in SECTION_MAP.items():
        if chapter_id == "_title":
            continue

        raw = sections.get(section_label, "")
        if not raw:
            continue

        lines = raw.split('\n')
        text_parts = []
        choices = []
        chapter_title = ""
        found_choices = False

        for line in lines:
            line = line.strip()
            if not line:
                continue

            if re.match(r'^words\s*:', line, re.IGNORECASE):
                continue

            if re.match(r'^choices\s*:', line, re.IGNORECASE):
                found_choices = True
                continue

            choice_match = re.match(r'^\s*(\d+)[.、．\)]\s*(.+?)(?:\s*→\s*(\S+))?\s*$', line)
            if choice_match:
                choice_text = choice_match.group(2).strip()
                choice_next = choice_match.group(3) or ""
                choices.append({"t": choice_text, "n": choice_next})
                continue

            if found_choices:
                continue

            if not chapter_title:
                chapter_title = line.replace('__', '').strip()
            else:
                text_parts.append(line)

        chapter_text = ' '.join(text_parts)

        if not chapter_text:
            chapter_text = chapter_title
            chapter_title = ""

        is_ending = chapter_id.startswith("e_")

        if is_ending:
            end_info = ENDING_DEFAULTS.get(chapter_id, {})
            chapters[chapter_id] = {
                "e": True,
                "ty": end_info.get("ty", "bronze"),
                "title": chapter_title or f"Ending · {end_info.get('ty', 'bronze').title()}",
                "badge": end_info.get("badge", ""),
                "bbg": end_info.get("bbg", ""),
                "text": chapter_text,
                "tip": end_info.get("tip", ""),
                "words": [w for w in target_words if f"__{w}__" in chapter_text],
            }
        else:
            routing = ROUTE_MAP.get(chapter_id, [])
            built_choices = []
            for i, choice in enumerate(choices):
                next_id = choice.get("n") or (routing[i] if i < len(routing) else "end_gold")
                choice_display = choice["t"].replace('__', '').strip()
                if choice_display:
                    built_choices.append({
                        "id": f"{chapter_id}_{chr(65 + i)}",
                        "t": choice_display,
                        "n": next_id,
                    })

            if not built_choices and not is_ending:
                for i, next_id in enumerate(routing):
                    built_choices.append({
                        "id": f"{chapter_id}_{chr(65 + i)}",
                        "t": "Continue the adventure...",
                        "n": next_id,
                    })

            chapters[chapter_id] = {
                "title": chapter_title or "Chapter",
                "text": chapter_text,
                "words": [w for w in target_words if f"__{w}__" in chapter_text],
                "choices": built_choices,
            }

        chapter_ids_found.add(chapter_id)

    required = ["start", "n1a", "n1b", "n1c", "n2a", "n2b", "n2c",
                 "n3a", "n3b", "n3c", "n4a", "n4b", "n4c",
                 "e_gold", "e_silver", "e_bronze"]
    missing = [r for r in required if r not in chapters]
    if missing:
        print(f"    [PARSE] Missing chapters: {missing}")

    if "start" not in chapters:
        print("    [PARSE] Missing required 'start' chapter")
        return None

    return {
        "title": title,
        "chapters": chapters,
    }


# ============================================================
# Word coverage validation
# ============================================================

def _validate_word_coverage(story: dict, target_words: list) -> tuple:
    """Verify ALL target words appear as __word__ in at least one chapter.
    Returns (passed: bool, missing: list)."""
    all_text = ' '.join(
        ch.get('text', '') for ch in story.get('chapters', {}).values()
    )
    missing = []
    for w in target_words:
        if f"__{w}__" not in all_text:
            in_choices = False
            for ch in story.get('chapters', {}).values():
                for c in ch.get('choices', []):
                    if f"__{w}__" in c.get('t', ''):
                        in_choices = True
                        break
                if in_choices:
                    break
            if not in_choices:
                missing.append(w)
    return len(missing) == 0, missing


# ============================================================
# Main generation function
# ============================================================

def generate_full_story_with_llm(level: str, story_type: str, target_words: list) -> Optional[dict]:
    """
    Generate a complete story tree using LLM with designer templates as reference.

    Reads the corresponding type's HTML template, builds a reference for the LLM,
    asks the LLM to write a NEW story, and parses the output.

    Returns {title, chapters} dict on success, None on failure.
    """
    if not DEEPSEEK_API_KEY:
        print("    [LLM] API key not configured, skipping")
        return None

    template_path = TEMPLATE_PATHS.get(story_type)
    if not template_path or not os.path.exists(template_path):
        print(f"    [LLM] Template not found for {story_type}: {template_path}")
        return None

    print(f"    [LLM] Generating {story_type} story via LLM (template-based reference)...")
    print(f"    [LLM] Target words ({len(target_words)}): {', '.join(target_words)}")

    messages = _build_llm_prompt(story_type, level, target_words)
    if not messages:
        return None

    response = call_llm_api(messages, max_tokens=3500)
    if not response:
        print("    [LLM] No response from API")
        return None

    print(f"    [LLM] Raw response: {len(response)} chars")

    parsed = _parse_llm_story_output(response, target_words)
    if not parsed:
        print("    [LLM] Failed to parse story output")
        return None

    passed, missing = _validate_word_coverage(parsed, target_words)
    if not passed:
        print(f"    [LLM] Word coverage check: {len(missing)} missing words: {missing}")
    else:
        print(f"    [LLM] All {len(target_words)} words covered in story")

    chapters_count = len(parsed.get("chapters", {}))
    print(f"    [LLM] Parsed {chapters_count} chapters, title='{parsed.get('title', '?')}'")

    return parsed
