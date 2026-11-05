import { error, json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { elasticsearchHeaders } from '$lib/server/es-basic-headers';
import { resolveLogIndexForSite } from '$lib/server/log-index-resolve';
import {
  buildCategoryRuleEsClauses,
  buildDocumentFilterClauses,
  parseDocumentFiltersParam,
  type CategoryRule,
} from '$lib/log-document-filter';
import { SITE_CONFIGS } from '$lib/site-config';

/**
 * POST /api/logs/category-counts
 * Body: { siteId, index, timeFrom, timeTo, keyword?, documentFilters?, categories: [{ id, rule }] }
 */
export async function POST({ request, fetch: customFetch }) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') throw error(400, 'JSON body required');

  const siteId = String((body as { siteId?: unknown }).siteId ?? '').trim();
  const indexParam = String((body as { index?: unknown }).index ?? '').trim();
  if (!siteId) throw error(400, 'siteId is required');
  if (!indexParam) throw error(400, 'index is required');
  if (!SITE_CONFIGS[siteId]) throw error(404, `Site not found: ${siteId}`);

  const timeFrom =
    String((body as { timeFrom?: unknown }).timeFrom ?? '') ||
    new Date(Date.now() - 3600000).toISOString();
  const timeTo =
    String((body as { timeTo?: unknown }).timeTo ?? '') || new Date().toISOString();
  const keyword = String((body as { keyword?: unknown }).keyword ?? '*') || '*';

  const docRaw = (body as { documentFilters?: unknown }).documentFilters;
  const docParsed = parseDocumentFiltersParam(
    typeof docRaw === 'string' ? docRaw : docRaw != null ? JSON.stringify(docRaw) : '[]',
  );
  if (!docParsed.ok) throw error(400, docParsed.message);
  const baseDocFilters = buildDocumentFilterClauses(docParsed.filters);

  const categoriesRaw = (body as { categories?: unknown }).categories;
  if (!Array.isArray(categoriesRaw)) throw error(400, 'categories must be an array');

  const resolved = resolveLogIndexForSite({
    siteId,
    mode: SITE_CONFIGS[siteId].defaultLogMode ?? 'k8s',
    index: indexParam,
    timeFrom,
    timeTo,
  });
  if (!resolved.ok) {
    throw error(resolved.code === 'FACTORY_CODE_MISSING' ? 422 : 400, resolved.message);
  }

  const esUrl = privateEnv.ES_BASE_URL || 'http://localhost:9200';
  const counts: { id: string; name?: string; total: number }[] = [];

  for (const cat of categoriesRaw) {
    if (!cat || typeof cat !== 'object') continue;
    const id = String((cat as { id?: unknown }).id ?? '');
    const name = (cat as { name?: unknown }).name;
    const rule = (cat as { rule?: CategoryRule }).rule ?? { documentFilters: [] };
    const extra = buildCategoryRuleEsClauses(rule);

    const esQuery = {
      size: 0,
      track_total_hits: true,
      query: {
        bool: {
          must: [{ query_string: { query: keyword } }, ...extra.must],
          filter: [
            { range: { '@timestamp': { gte: timeFrom, lte: timeTo } } },
            ...baseDocFilters,
            ...extra.filter,
          ],
        },
      },
    };

    let total = 0;
    try {
      const res = await customFetch(`${esUrl}/${resolved.index}/_search`, {
        method: 'POST',
        headers: elasticsearchHeaders(),
        body: JSON.stringify(esQuery),
      });
      if (res.ok) {
        const data = await res.json();
        total = data.hits?.total?.value ?? data.hits?.total ?? 0;
        if (typeof total !== 'number') total = 0;
      }
    } catch {
      total = 0;
    }
    counts.push({
      id,
      name: typeof name === 'string' ? name : undefined,
      total,
    });
  }

  return json({ counts, index: resolved.index });
}
