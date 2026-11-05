/**
 * Collapse concrete dated Elasticsearch index names into Log Index Pattern families
 * for Site Index Catalog / Index Watchlist (ADR-0021).
 */

/** Trailing daily `YYYY.MM.DD` or ISO-week-ish `YYYY.WW` suffix after a hyphen. */
const DATE_OR_WEEK_SUFFIX = /-\d{4}\.\d{2}(?:\.\d{2})?$/;

export function collapseIndexToFamily(concreteName: string): string {
  const trimmed = concreteName.trim();
  if (!trimmed) return '';
  if (DATE_OR_WEEK_SUFFIX.test(trimmed)) {
    return `${trimmed.replace(DATE_OR_WEEK_SUFFIX, '')}-*`;
  }
  // Already a family / wildcard
  if (trimmed.endsWith('-*') || trimmed.endsWith('*')) return trimmed;
  return trimmed;
}

export function collapseIndicesToFamilies(concreteNames: string[]): string[] {
  const set = new Set<string>();
  for (const name of concreteNames) {
    const family = collapseIndexToFamily(name);
    if (family) set.add(family);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export type CatalogFilterMode = 'fuzzy' | 'regex';

export type FilterIndexFamiliesResult =
  | { ok: true; families: string[] }
  | { ok: false; code: 'INVALID_REGEX'; message: string };

/**
 * Filter family names. Fuzzy = case-insensitive substring.
 * Regex = full JS RegExp on the family string (length-capped).
 */
export function filterIndexFamilies(
  families: string[],
  query: string,
  mode: CatalogFilterMode = 'fuzzy',
): FilterIndexFamiliesResult {
  const q = query.trim();
  if (!q) return { ok: true, families: [...families] };

  if (mode === 'fuzzy') {
    const lower = q.toLowerCase();
    return {
      ok: true,
      families: families.filter((f) => f.toLowerCase().includes(lower)),
    };
  }

  if (q.length > 200) {
    return { ok: false, code: 'INVALID_REGEX', message: 'regex exceeds 200 characters' };
  }
  try {
    const re = new RegExp(q, 'i');
    return { ok: true, families: families.filter((f) => re.test(f)) };
  } catch {
    return { ok: false, code: 'INVALID_REGEX', message: 'invalid regular expression' };
  }
}
