"""Typo-tolerant free-text matching for small candidate sets.

Search bars that hit the DB (GET /detections `q=` over waste_type and area
name, used by the web TrashLogs page) take free text, and a plain
`LIKE %q%` returns nothing on a single typo — which feels like a broken
feature. The vocabulary here is tiny in practice (5 waste classes plus the
areas an admin has drawn), so the cheap, correct approach is:

    client sends q  ->  fetch distinct candidate values (bounded, tiny)
                    ->  score candidates in Python (this module, no deps)
                    ->  keep the matched values  ->  filter rows with SQL IN

No pg_trgm extension, no schema change, bounded cost. Pure functions only
(no SQLAlchemy/DB imports) so the scoring can be tested by importing the
module directly.

web/src/services/fuzzySearch.ts implements the same scoring for the
client-side searches (MapView area search). The two must stay identical:
same normalization, same per-token tiers, same edit budgets.

Per-token rules: exact match > prefix > substring > edit distance within
a budget (1 edit for tokens <= 4 chars, 2 up to 8, 3 larger; 2-char and
shorter tokens must prefix-match — they can't claim a typo). A candidate
matches only if EVERY query token hits its text (AND semantics),
mirroring the old contiguous LIKE-substring behavior.
"""

import re
import unicodedata
from typing import Iterable

_SPLIT_RE = re.compile(r"[^a-z0-9]+")
_CAMEL_RE = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")


def tokenize(text: str) -> list[str]:
    """Normalize + tokenize: strip diacritics, split camelCase/snake_case,
    lowercase, drop punctuation."""
    cleaned = unicodedata.normalize("NFKD", text or "")
    cleaned = "".join(c for c in cleaned if not unicodedata.combining(c))
    # camelCase must be split BEFORE lowercasing (it needs the case boundary)
    cleaned = _CAMEL_RE.sub(" ", cleaned)
    cleaned = cleaned.replace("_", " ").lower()
    return [w for w in _SPLIT_RE.split(cleaned) if w]


def _edit_distance_within(a: str, b: str, budget: int):
    """Levenshtein distance capped at `budget` (None = too far), with the
    same early-abort as the web implementation."""
    if abs(len(a) - len(b)) > budget:
        return None
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        row = [i]
        row_min = i
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            d = min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
            row.append(d)
            if d < row_min:
                row_min = d
        if row_min > budget:
            return None
        prev = row
    # The early-abort only catches rows whose MIN is over budget; a cheap
    # diagonal can keep row_min low while the final cell drifts high, so
    # verify the result too.
    return prev[-1] if prev[-1] <= budget else None


def _common_prefix_len(a: str, b: str) -> int:
    n = 0
    for ca, cb in zip(a, b):
        if ca != cb:
            break
        n += 1
    return n


def _token_score(query_token: str, target_token: str) -> float:
    if not query_token or not target_token:
        return 0.0
    if query_token == target_token:
        return 1.0
    if len(query_token) <= 2:
        return 0.9 if target_token.startswith(query_token) else 0.0
    if target_token.startswith(query_token):
        return 0.95
    if query_token in target_token:
        return 0.9
    budget = 1 if len(query_token) <= 4 else (2 if len(query_token) <= 8 else 3)
    if len(target_token) > len(query_token) and _common_prefix_len(query_token, target_token) >= len(query_token) - 1:
        # Truncated-tail tolerance: a query cut short while typing shouldn't
        # miss ("packg" → "packaging"). Missing tail letters are pure
        # insertions, so widen the budget only up to the tail length (capped
        # at 4) — and ONLY when the tokens share a near-full common prefix
        # ("glass" vs "plastic" shares none, so it stays a non-match).
        budget = max(budget, min(4, len(target_token) - len(query_token)))
    distance = _edit_distance_within(query_token, target_token, budget)
    if distance is None:
        return 0.0
    return max(0.45, 1.0 - 0.15 * distance)


def text_score(query: str, text: str) -> float:
    """Score a query against a candidate value (0 = no match)."""
    query_tokens = tokenize(query)
    if not query_tokens:
        return 0.0
    target_tokens = tokenize(text)
    if not target_tokens:
        return 0.0

    score = 1.0
    for token in query_tokens:
        best = 0.0
        for target in target_tokens:
            s = _token_score(token, target)
            if s > best:
                best = s
            if best == 1.0:
                break
        if best == 0.0:
            return 0.0
        score *= best
    return score


def matched_values(query: str, candidates: Iterable[str]) -> list[str]:
    """Return the candidate values the query (fuzzily) matches.

    Input order is preserved, best matches first per the score; values with
    score 0 are dropped entirely.
    """
    scored = []
    for value in candidates:
        if not value:
            continue
        s = text_score(query, value)
        if s > 0:
            scored.append((s, value))
    scored.sort(key=lambda pair: -pair[0])
    return [value for _, value in scored]
