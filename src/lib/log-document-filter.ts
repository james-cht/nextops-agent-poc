/**
 * Document Filter → Elasticsearch bool.filter clauses (ADR-0021).
 */

export type DocumentFilter = {
  path: string;
  value: string | number | boolean;
};

export type DocumentFilterParseResult =
  | { ok: true; filters: DocumentFilter[] }
  | { ok: false; message: string };

const PATH_SAFE = /^[a-zA-Z0-9_@.-]+$/;
const MAX_FILTERS = 32;

export function parseDocumentFiltersParam(raw: string | null | undefined): DocumentFilterParseResult {
  if (raw == null || raw.trim() === '') return { ok: true, filters: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'documentFilters must be JSON' };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, message: 'documentFilters must be an array' };
  }
  if (parsed.length > MAX_FILTERS) {
    return { ok: false, message: `documentFilters exceeds ${MAX_FILTERS}` };
  }
  const filters: DocumentFilter[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') {
      return { ok: false, message: 'each documentFilter must be an object' };
    }
    const path = String((item as { path?: unknown }).path ?? '').trim();
    const value = (item as { value?: unknown }).value;
    if (!path || !PATH_SAFE.test(path)) {
      return { ok: false, message: `invalid documentFilter path: ${path || '(empty)'}` };
    }
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      return { ok: false, message: 'documentFilter value must be string, number, or boolean' };
    }
    filters.push({ path, value });
  }
  return { ok: true, filters };
}

/** Build ES term/terms filter clauses for Document Filters (AND). */
export function buildDocumentFilterClauses(filters: DocumentFilter[]): object[] {
  return filters.map((f) => ({ term: { [f.path]: f.value } }));
}

export type MessagePattern = {
  type: 'keyword' | 'regex';
  value: string;
};

export type CategoryRule = {
  documentFilters: DocumentFilter[];
  /** Numeric range filters (e.g. 5xx on http.response.status_code). */
  ranges?: { path: string; gte?: number; lte?: number }[];
  messagePattern?: MessagePattern | null;
};

/** Extra must/filter clauses for a Category Rule (AND with stream scope). */
export function buildCategoryRuleEsClauses(rule: CategoryRule): {
  must: object[];
  filter: object[];
} {
  const filter = buildDocumentFilterClauses(rule.documentFilters ?? []);
  for (const r of rule.ranges ?? []) {
    if (!r.path || !PATH_SAFE.test(r.path)) continue;
    const range: Record<string, number> = {};
    if (typeof r.gte === 'number') range.gte = r.gte;
    if (typeof r.lte === 'number') range.lte = r.lte;
    if (Object.keys(range).length) {
      filter.push({ range: { [r.path]: range } });
    }
  }
  const must: object[] = [];
  const mp = rule.messagePattern;
  if (mp?.value?.trim()) {
    if (mp.type === 'regex') {
      must.push({
        query_string: {
          query: `/${mp.value.replace(/\//g, '\\/')}/`,
          fields: ['message', 'message_log', 'log'],
          default_operator: 'AND',
        },
      });
    } else {
      must.push({
        query_string: {
          query: mp.value.trim(),
          fields: ['message', 'message_log', 'log', '*'],
          default_operator: 'AND',
        },
      });
    }
  }
  return { must, filter };
}
