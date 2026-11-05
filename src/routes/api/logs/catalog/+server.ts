import { error, json } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { elasticsearchHeaders } from '$lib/server/es-basic-headers';
import { getLogIndexPrefix, resolveLogIndexForSite } from '$lib/server/log-index-resolve';
import { siteLogPrefix } from '$lib/log-index';
import {
  collapseIndicesToFamilies,
  filterIndexFamilies,
  type CatalogFilterMode,
} from '$lib/log-index-family';
import { SITE_CONFIGS } from '$lib/site-config';

/** GET /api/logs/catalog — Site Index Catalog (ADR-0021). */
export async function GET({ url, fetch: customFetch }) {
  const siteId = url.searchParams.get('siteId')?.trim() ?? '';
  if (!siteId) throw error(400, 'siteId is required');
  const config = SITE_CONFIGS[siteId];
  if (!config) throw error(404, `Site not found: ${siteId}`);
  if (!config.factoryCode?.trim()) {
    throw error(422, `Site "${siteId}" has no Factory Code`);
  }

  const q = url.searchParams.get('q') ?? '';
  const modeRaw = url.searchParams.get('filterMode') ?? 'fuzzy';
  const filterMode: CatalogFilterMode = modeRaw === 'regex' ? 'regex' : 'fuzzy';

  const prefix = getLogIndexPrefix();
  const sitePrefix = siteLogPrefix(prefix, config.factoryCode);
  const esUrl = privateEnv.ES_BASE_URL || 'http://localhost:9200';
  const catPattern = `${sitePrefix}-*`;

  let concrete: string[] = [];
  try {
    const res = await customFetch(
      `${esUrl}/_cat/indices/${encodeURIComponent(catPattern)}?format=json&h=index`,
      { headers: elasticsearchHeaders({}) },
    );
    if (res.ok) {
      const data = (await res.json()) as { index?: string }[];
      if (Array.isArray(data)) {
        concrete = data.map((r) => r.index).filter((x): x is string => typeof x === 'string');
      }
    } else if (res.status !== 404) {
      const text = await res.text().catch(() => '');
      throw error(502, `Elasticsearch catalog failed: ${res.status} ${text.slice(0, 200)}`);
    }
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e) throw e;
    throw error(502, e instanceof Error ? e.message : 'Elasticsearch catalog unreachable');
  }

  // Also include the site-wide family so operators can watch the whole prefix
  const families = collapseIndicesToFamilies(concrete);
  const siteWide = `${sitePrefix}-*`;
  if (!families.includes(siteWide)) families.unshift(siteWide);

  const filtered = filterIndexFamilies(families, q, filterMode);
  if (!filtered.ok) throw error(400, filtered.message);

  // sanity: resolve default still works
  resolveLogIndexForSite({ siteId, mode: config.defaultLogMode ?? 'k8s' });

  return json({
    siteId,
    factoryCode: config.factoryCode,
    prefix: sitePrefix,
    families: filtered.families,
    concreteCount: concrete.length,
  });
}
