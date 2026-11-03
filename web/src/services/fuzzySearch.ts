/**
 * Typo-tolerant matching for small, in-memory lists (MapView area search).
 *
 * Plain substring search scores nothing on a single typo ("bali costline"
 * vs "bali coastline"), which feels like a broken feature. Instead, each
 * candidate gets a score:
 *
 *   exact word > word prefix > substring > edit distance within a budget
 *
 * every word of the query must hit somewhere in the text (AND semantics).
 * A score of 0 means no match; callers drop those and sort the rest best
 * first.
 *
 * No dependencies; one pass of O(query words × text words) with a bounded
 * edit-distance walk is plenty for the handful of area names a user can
 * draw. This mirrors backend/services/fuzzy_search.py — keep the two in
 * lockstep.
 */

/** Normalize + tokenize: diacritics stripped, camelCase/snake_case split,
 *  lowercase, punctuation dropped. */
export function tokenize(text: string): string[] {
  const cleaned = (text ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // split camelCase before lowering
    .toLowerCase()
    .replace(/_/g, " ");
  return cleaned.split(/[^a-z0-9]+/).filter(Boolean);
}

/** Bounded Levenshtein distance: returns the distance if it fits the budget,
 *  otherwise null (early-exit once a row can't possibly beat the budget). */
function editDistanceWithin(a: string, b: string, budget: number): number | null {
  if (Math.abs(a.length - b.length) > budget) return null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const d = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + cost,
      );
      row.push(d);
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > budget) return null;
    prev = row;
  }
  // Early abort only catches rows whose minimum is already over budget;
  // re-verify the final cell too (mirrors backend fuzzy_search.py).
  return prev[b.length] <= budget ? prev[b.length] : null;
}

/** Score one query token against one target token (0 = no match). */
function tokenScore(queryToken: string, targetToken: string): number {
  if (!queryToken || !targetToken) return 0;
  if (queryToken === targetToken) return 1;
  // Very short tokens can't claim a typo: they must prefix-match exactly.
  if (queryToken.length <= 2) return targetToken.startsWith(queryToken) ? 0.9 : 0;
  if (targetToken.startsWith(queryToken)) return 0.95;
  if (targetToken.includes(queryToken)) return 0.9;
  let budget = queryToken.length <= 4 ? 1 : queryToken.length <= 8 ? 2 : 3;
  if (targetToken.length > queryToken.length) {
    // Tolerance for a query cut short mid-typing ("packg" → "packaging"):
    // widen the budget up to the missing tail (capped at 4), but only when
    // the tokens share a near-full common prefix — "glass" vs "plastic"
    // shares none, so it stays a non-match. Mirrors backend fuzzy_search.py.
    let prefix = 0;
    while (
      prefix < queryToken.length &&
      queryToken[prefix] === targetToken[prefix]
    ) {
      prefix++;
    }
    if (prefix >= queryToken.length - 1) {
      budget = Math.max(budget, Math.min(4, targetToken.length - queryToken.length));
    }
  }
  const distance = editDistanceWithin(queryToken, targetToken, budget);
  if (distance === null) return 0;
  return Math.max(0.45, 1 - 0.15 * distance);
}

/** Score `query` against `text` — 1 (named exactly) down to ~0.45 (a token
 *  on its edit-distance budget), 0 when any token misses entirely. */
export function fuzzyScore(query: string, text: string): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;
  const targetTokens = tokenize(text);
  if (targetTokens.length === 0) return 0;

  let score = 1;
  for (const token of queryTokens) {
    let best = 0;
    for (const target of targetTokens) {
      const s = tokenScore(token, target);
      if (s > best) best = s;
      if (best === 1) break;
    }
    if (best === 0) return 0;
    score *= best;
  }
  return score;
}
