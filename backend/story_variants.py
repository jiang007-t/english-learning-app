"""
story_variants.py — Randomization pools & story variation generators.
Ensures every story generation produces unique content.
"""

import random
import re

# ============================================================
# 1. Random Element Pools
# ============================================================

# Adventure settings
ADVENTURE_SETTINGS = [
    ("vast forest", "mountains", "ancient ruins"),
    ("dense jungle", "hidden valley", "lost temple"),
    ("rocky canyon", "desert oasis", "abandoned mine"),
    ("misty marsh", "rolling hills", "old lighthouse"),
]

SURVIVAL_SETTINGS = [
    ("tropical island", "dense jungle", "coral reef"),
    ("rocky shore", "bamboo forest", "hidden cave"),
    ("sandy beach", "mangrove swamp", "volcanic hill"),
]

SCIFI_SETTINGS = [
    ("distant planet", "space station", "asteroid field"),
    ("crystal moon", "alien forest", "starry void"),
    ("red desert", "floating city", "nebula clouds"),
]

MYSTERY_SETTINGS = [
    ("old mansion", "hidden library", "secret room"),
    ("museum", "dusty attic", "locked cabinet"),
    ("garden maze", "underground tunnel", "clock tower"),
]

FAIRYTALE_SETTINGS = [
    ("enchanted forest", "magic tower", "secret garden"),
    ("candy village", "singing river", "rainbow bridge"),
    ("starlight meadow", "gingerbread house", "fairy ring"),
]

MAGIC_SETTINGS = [
    ("spell library", "potion lab", "enchantment hall"),
    ("crystal garden", "floating tower", "star classroom"),
]

ANIMAL_SETTINGS = [
    ("sunny meadow", "cozy barn", "quiet pond"),
    ("green hill", "gentle stream", "flower field"),
    ("warm den", "wooden bridge", "apple orchard"),
]

SCHOOL_SETTINGS = [
    ("art room", "school garden", "science lab"),
    ("library", "music hall", "sports field"),
    ("cafeteria", "rooftop", "classroom"),
]

# Descriptive modifiers for variety
TIME_MODIFIERS = [
    "early morning", "golden afternoon", "warm evening",
    "sunny day", "quiet dusk", "bright dawn",
    "gentle twilight", "fresh morning", "peaceful sunset",
]

WEATHER_MODIFIERS = [
    "with a gentle breeze", "under a clear blue sky",
    "as birds sing in the distance", "with soft sunlight filtering through",
    "while butterflies dance nearby", "as leaves rustle in the wind",
]

FEELING_MODIFIERS = [
    "You feel excited and ready.",
    "Your heart beats with anticipation.",
    "A sense of wonder fills you.",
    "You take a deep breath, feeling brave.",
    "Curiosity pushes you forward.",
    "You smile, ready for what comes next.",
]

# ============================================================
# 2. Randomization Helper
# ============================================================

def pick(pool):
    """Pick a random item from a pool, or return first if pool is single."""
    if not pool:
        return ""
    return random.choice(pool)

def shuffle_choices(chapters):
    """Shuffle the order of choices in each chapter (but keep ids intact)."""
    for ch_id, ch in chapters.items():
        if ch.get("e") or not ch.get("choices"):
            continue
        choices = ch["choices"]
        # Don't shuffle if there's only 1 choice
        if len(choices) <= 1:
            continue
        # Shuffle but maintain the mapping
        random.shuffle(choices)
        ch["choices"] = choices
    return chapters

def randomize_generator_output(gen_fn, level, words, w1, w2, w3):
    """Wrap a generator function to add randomization to its output."""
    chapters = gen_fn(level, words, w1, w2, w3)
    
    # Apply variations
    chapters = shuffle_choices(chapters)
    
    return chapters


# ============================================================
# 3. Story Title Generator
# ============================================================

ADVENTURE_TITLES = [
    "The {w} of Secrets",
    "The Great {w} Adventure",
    "Journey to the Hidden {w}",
    "The Mystery of the Lost {w}",
    "Quest for the Ancient {w}",
    "Beyond the {w} Valley",
    "The {w} Expedition",
    "Trail of the {w}",
]

SURVIVAL_TITLES = [
    "Surviving the {w} Island",
    "The {w} Challenge",
    "Lost in the {w} Wilds",
    "The Great {w} Rescue",
    "Island of {w}",
    "The {w} Survival Game",
]

SCIFI_TITLES = [
    "The {w} Galaxy",
    "Mission to {w} Planet",
    "Stars of {w}",
    "The {w} Signal",
    "Journey Beyond {w}",
    "The {w} Star",
]

MYSTERY_TITLES = [
    "The Case of the {w}",
    "Mystery at {w} Manor",
    "The {w} Secret",
    "Who Stole the {w}?",
    "The {w} Puzzle",
    "The Missing {w}",
]

FAIRYTALE_TITLES = [
    "The {w} Kingdom",
    "The Princess of {w}",
    "A {w} Wish",
    "The Magic {w}",
    "The Enchanted {w}",
    "Beyond the {w} Door",
]

MAGIC_TITLES = [
    "The {w} Academy",
    "A Spell for {w}",
    "The {w} Tournament",
    "Secrets of {w} Magic",
    "The {w} Wand",
]

ANIMAL_TITLES = [
    "The {w} Forest Friends",
    "{w} the Brave",
    "Adventures in {w} Wood",
    "The {w} Big Day",
    "A {w} in Need",
    "The {w} Rescue Team",
]

SCHOOL_TITLES = [
    "The {w} School Project",
    "{w} Class Challenge",
    "A Day for {w}",
    "The {w} Friendship Club",
    "Lessons of {w}",
    "The {w} School Fair",
]

def generate_title(story_type, w1):
    """Generate a unique title based on story type and first target word."""
    title_pools = {
        "Adventure": ADVENTURE_TITLES,
        "Survival": SURVIVAL_TITLES,
        "SciFi": SCIFI_TITLES,
        "Mystery": MYSTERY_TITLES,
        "FairyTale": FAIRYTALE_TITLES,
        "MagicSchool": MAGIC_TITLES,
        "Animal": ANIMAL_TITLES,
        "School": SCHOOL_TITLES,
    }
    pool = title_pools.get(story_type, ADVENTURE_TITLES)
    template = pick(pool)
    return template.replace("{w}", w1.title())
