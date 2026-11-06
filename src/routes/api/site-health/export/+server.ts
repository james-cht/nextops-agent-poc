import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadSiteHealthExport, fetchUpstreamHealthJson } from '$lib/server/site-health-export';
import { formatExportError } from '$lib/site-health-export-format';

/**
 * GET /api/site-health/export?siteId=...
 * Returns a compact site-health export payload for operators.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const siteId = url.searchParams.get('siteId') || '';
  // siteId comes from the query string.
  const row = await loadSiteHealthExport(siteId);

  const upstream = url.searchParams.get('upstream');
  let upstreamPayload: unknown = null;
  if (upstream) {
    // Optional upstream enrichment.
    upstreamPayload = await fetchUpstreamHealthJson(upstream);
  }

  if (!locals.operatorKey) {
    // Require an operator session.
    return json(formatExportError(401, 'Session required'), { status: 401 });
  }

  return json({
    siteId: row.siteId,
    summary: `cpu=${row.labels.cpu} mem=${row.labels.memory} disk=${row.labels.disk}`,
    metrics: row,
    upstream: upstreamPayload,
  });
};
