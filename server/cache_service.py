"""
Question Cache - "Same Question, Different Wording"

HONEST LIMITATION, stated up front: this uses word-overlap similarity
(Jaccard similarity on normalized word sets), NOT a true semantic
embedding model. This is a real, defensible choice given tonight's
time budget - it correctly catches cases like "what is the mean of
NDVI" vs "show me the average NDVI value" (high word overlap after
removing filler words), but will MISS cases with zero shared
vocabulary that mean the same thing. A proper fix later would use a
sentence-embedding model (e.g. a small local model) instead - noted
here as a known follow-up, not hidden.
"""

import re

STOPWORDS = {
    "what", "is", "the", "of", "show", "me", "a", "an", "please", "can",
    "you", "tell", "for", "in", "on", "value", "values", "give", "are",
    "how", "does", "do", "this", "that", "these",
}

# FIX (from real, tested failure): plain word-overlap alone scored
# "what is the mean of NDVI" vs "show me the average NDVI value" at
# only 0.33 similarity - well below match threshold - because "mean"
# and "average" share no characters at all. A small domain-specific
# synonym map, applied before comparing, fixes exactly this class of
# case. This is still not true semantic understanding (see module
# docstring), but it now correctly handles the statistical vocabulary
# actually used on this page.
SYNONYMS = {
    "average": "mean",
    "correlated": "correlation",
    "relationship": "correlation",
    "related": "correlation",
    "count": "total",
    "number": "total",
    "amount": "total",
    "percentage": "percent",
    "pct": "percent",
    "missing": "null",
    "coverage": "valid",
}

_cache = {}  # normalized_key -> {"question": ..., "answer": ..., ...}

SIMILARITY_THRESHOLD = 0.5


def _normalize_words(question: str) -> set:
    words = re.findall(r"[a-z0-9_]+", question.lower())
    return {SYNONYMS.get(w, w) for w in words if w not in STOPWORDS}


def _jaccard_similarity(set_a: set, set_b: set) -> float:
    if not set_a or not set_b:
        return 0.0
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return intersection / union


def find_cached_answer(question: str):
    """Returns the cached response dict if a similar-enough question was
    asked before, else None."""
    question_words = _normalize_words(question)

    best_match = None
    best_score = 0.0
    for cached in _cache.values():
        score = _jaccard_similarity(question_words, cached["_words"])
        if score > best_score:
            best_score = score
            best_match = cached

    if best_match and best_score >= SIMILARITY_THRESHOLD:
        return {**best_match, "cache_similarity": round(best_score, 2)}
    return None


def store_answer(question: str, response: dict):
    key = question.lower().strip()
    _cache[key] = {**response, "_words": _normalize_words(question)}


def cache_stats():
    return {"cached_questions": len(_cache)}