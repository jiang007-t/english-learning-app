"""
backend/story_pipeline.py
=========================
Branching story tree generator for interactive English learning games.

Generates a complete branching story tree (all chapters, all paths, all endings)
in one shot, purely via LLM using designer HTML templates as reference.

Key features:
- 8 story types with unique branching structures
- 4 difficulty levels (L1-L4) controlling text complexity
- Target words naturally integrated into each chapter
- Multiple ending tiers (gold/silver/bronze)
- Detection layer (word count, cramming, adjacent repetition, etc.)
"""

import re
import uuid
from story_llm import generate_full_story_with_llm, TYPE_ALIASES

# ============================================================
# 1. Detection Layer
# ============================================================

LIMITS = {"L1": (10, 60), "L2": (20, 120), "L3": (40, 200), "L4": (60, 300)}


def count_words(text):
    return len(text.split())


def check_wordcount(text, level):
    lo, hi = LIMITS.get(level, (0, 9999))
    wc = count_words(text)
    if wc > hi:
        return False, f"too long: {wc}w > {hi}w"
    if wc < lo:
        return False, f"too short: {wc}w < {lo}w"
    return True, f"{wc}w"


def check_adjacent(text, target_words):
    violations = []
    words = text.split()
    clean = [w.strip('__.,!?;:"()[]') for w in words]
    for tw in target_words:
        positions = [i for i, w in enumerate(clean) if w.lower() == tw.lower()]
        for i in range(len(positions) - 1):
            gap = positions[i + 1] - positions[i]
            if gap <= 5:
                violations.append(f"'{tw}' gap={gap}")
                break
    return violations


def check_planned_words(text, planned_words):
    missing = []
    for pw in planned_words:
        if f"__{pw}__" not in text:
            missing.append(pw)
    return missing


def check_cramming(text, target_words, max_count=4):
    violations = []
    for tw in target_words:
        marker_count = text.count(f"__{tw}__")
        plain_text = text.replace(f"__{tw}__", " ")
        plain_count = len(re.findall(r'\b' + re.escape(tw) + r'\b', plain_text, re.IGNORECASE))
        total = marker_count + plain_count
        if total >= max_count:
            violations.append(f"'{tw}': {total}x (max {max_count - 1})")
    return violations


def validate_chapter(text, level, planned_words, target_words, is_ending, choices_count):
    problems = []
    ok, msg = check_wordcount(text, level)
    if not ok:
        problems.append(f"[WORDS] {msg}")
    for v in check_adjacent(text, target_words):
        problems.append(f"[ADJACENT] {v}")
    for m in check_planned_words(text, planned_words):
        problems.append(f"[MISSING] '{m}' not found")
    for c in check_cramming(text, target_words):
        problems.append(f"[CRAMMING] {c}")
    if not is_ending and choices_count < 2:
        problems.append(f"[CHOICE] {choices_count} choices, need >= 2")
    if is_ending and choices_count > 0:
        problems.append(f"[ENDING] ending should have 0 choices, got {choices_count}")
    return len(problems) == 0, problems


# ============================================================
# 2. Story Tree Validation
# ============================================================

def validate_tree(story):
    """
    Validate all chapters in a story tree.
    Returns (passed, errors) where errors is { chapter_id: [problems] }.
    """
    errors = {}
    for ch_id, ch in story["chapters"].items():
        text = ch.get("text", "")
        planned = ch.get("words", [])
        is_ending = ch.get("e", False)
        choices_count = len(ch.get("choices", []))
        passed, problems = validate_chapter(
            text, story["level"], planned, story["words"],
            is_ending, choices_count
        )
        if not passed:
            errors[ch_id] = problems
    return len(errors) == 0, errors


# ============================================================
# 3. Main Story Tree Generator (LLM-only)
# ============================================================

def _build_story_id():
    return f"llm_full_{uuid.uuid4().hex[:8]}"


def _recalc_words(story, target_words):
    """Recalculate words for all chapters based on actual text content."""
    for ch in story.get("chapters", {}).values():
        ch["words"] = [w for w in target_words if f"__{w}__" in ch.get("text", "")]
    return story


def _collect_story_words(story, target_words):
    """Collect which target words appear anywhere in the story."""
    all_text = ' '.join(
        ch.get('text', '') for ch in story.get('chapters', {}).values()
    )
    return [w for w in target_words if f"__{w}__" in all_text]


GENRE_NAMES = {
    "Adventure": "Adventure", "Survival": "Survival", "SciFi": "Sci-Fi",
    "Mystery": "Mystery", "FairyTale": "Fairy Tale", "MagicSchool": "Magic School",
    "Animal": "Animal Adventure", "School": "Campus Story",
}


def generate_story_tree_with_retry(level, story_type, target_words, max_retries=3):
    """
    Generate a story tree using LLM with designer template reference.
    Returns (story, passed, attempt_count, errors).
    """
    errors = {}

    canonical_type = TYPE_ALIASES.get(story_type.lower(), story_type)
    print(f"    [PIPELINE] story_type='{story_type}' → canonical='{canonical_type}'")

    for attempt in range(1, max_retries + 1):
        print(f"    [PIPELINE] Attempt {attempt}/{max_retries} — LLM full story generation")

        llm_story = generate_full_story_with_llm(level, canonical_type, target_words)

        if llm_story is None:
            print(f"    [PIPELINE] Attempt {attempt}: LLM returned None")
            continue

        chapters = llm_story.get("chapters", {})
        if not chapters or "start" not in chapters:
            print(f"    [PIPELINE] Attempt {attempt}: Missing 'start' chapter")
            continue

        required_chapters = {"start", "n1a", "n1b", "n1c", "n2a", "n2b", "n2c",
                              "n3a", "n3b", "n3c", "n4a", "n4b", "n4c",
                              "e_gold", "e_silver", "e_bronze"}
        found_chapters = set(chapters.keys())
        missing_chapters = required_chapters - found_chapters
        if missing_chapters:
            print(f"    [PIPELINE] Attempt {attempt}: Missing chapters: {missing_chapters}")

        story = {
            "storyId": _build_story_id(),
            "title": llm_story.get("title", "A New Story"),
            "type": GENRE_NAMES.get(canonical_type, story_type),
            "level": level,
            "words": target_words,
            "chapters": chapters,
            "allWords": _collect_story_words(llm_story, target_words),
        }

        story = _recalc_words(story, target_words)

        passed, validation_errors = validate_tree(story)
        if passed:
            print(f"    [PIPELINE] Attempt {attempt}: Validation PASSED, title='{story['title']}'")
            return story, True, attempt, {}

        print(f"    [PIPELINE] Attempt {attempt}: Validation FAILED ({len(validation_errors)} issues)")
        for ch_id, probs in list(validation_errors.items())[:3]:
            print(f"      {ch_id}: {'; '.join(probs[:2])}")
        errors = validation_errors

    print(f"    [PIPELINE] All {max_retries} attempts failed")
    error_msg = "Story generation failed after retries"

    error_story = {
        "storyId": f"error_{uuid.uuid4().hex[:8]}",
        "title": error_msg,
        "type": GENRE_NAMES.get(canonical_type, story_type),
        "level": level,
        "words": target_words,
        "chapters": {},
        "allWords": [],
    }
    return error_story, False, max_retries, errors
