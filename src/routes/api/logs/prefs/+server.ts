import { error, json } from '@sveltejs/kit';
import { getLocalSettingsStore } from '$lib/server/local-settings-store';
import type { StoredLogCategory } from '$lib/log-category-seeds';
import { validateLogIndexPattern } from '$lib/log-index';
import { getLogIndexPrefix } from '$lib/server/log-index-resolve';
import { SITE_CONFIGS } from '$lib/site-config';

function requireOperator(locals: App.Locals): string {
  const key = locals.operatorKey?.trim();
  if (!key) throw error(401, 'Operator session required');
  return key;
}

/** GET /api/logs/prefs?siteId= */
export async function GET({ url, locals }) {
  const operatorKey = requireOperator(locals);
  const siteId = url.searchParams.get('siteId')?.trim() ?? '';
  if (!siteId) throw error(400, 'siteId is required');
  if (!SITE_CONFIGS[siteId]) throw error(404, `Site not found: ${siteId}`);

  const prefs = getLocalSettingsStore().getSmartLoggingPrefs(operatorKey, siteId);
  return json(prefs);
}

/** PUT /api/logs/prefs — body: { siteId, watchlist, activeIndex, categories } */
export async function PUT({ request, locals }) {
  const operatorKey = requireOperator(locals);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') throw error(400, 'JSON body required');

  const siteId = String((body as { siteId?: unknown }).siteId ?? '').trim();
  if (!siteId) throw error(400, 'siteId is required');
  const config = SITE_CONFIGS[siteId];
  if (!config) throw error(404, `Site not found: ${siteId}`);
  if (!config.factoryCode?.trim()) throw error(422, 'Factory Code required');

  const prefix = getLogIndexPrefix();
  const watchlistRaw = (body as { watchlist?: unknown }).watchlist;
  if (!Array.isArray(watchlistRaw)) throw error(400, 'watchlist must be an array');
  const watchlist: string[] = [];
  for (const item of watchlistRaw) {
    const pattern = String(item ?? '').trim();
    if (!pattern) continue;
    const err = validateLogIndexPattern(pattern, prefix, config.factoryCode);
    if (err) throw error(400, err);
    watchlist.push(pattern);
  }
  if (watchlist.length === 0) throw error(400, 'watchlist must contain at least one pattern');

  let activeIndex = String((body as { activeIndex?: unknown }).activeIndex ?? '').trim() || null;
  if (activeIndex && !watchlist.includes(activeIndex)) {
    throw error(400, 'activeIndex must be in watchlist');
  }
  if (!activeIndex) activeIndex = watchlist[0];

  const categoriesRaw = (body as { categories?: unknown }).categories;
  let categories: StoredLogCategory[];
  if (categoriesRaw === undefined) {
    categories = getLocalSettingsStore().getSmartLoggingPrefs(operatorKey, siteId).categories;
  } else if (!Array.isArray(categoriesRaw)) {
    throw error(400, 'categories must be an array');
  } else {
    categories = categoriesRaw as StoredLogCategory[];
  }

  getLocalSettingsStore().putSmartLoggingPrefs(operatorKey, siteId, {
    watchlist,
    activeIndex,
    categories,
  });

  return json(getLocalSettingsStore().getSmartLoggingPrefs(operatorKey, siteId));
}
