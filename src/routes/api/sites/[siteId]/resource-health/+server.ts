import { json } from '@sveltejs/kit';
import { getSiteResourceHealth } from '$lib/server/site-resource-health';
import { clampResourceHealthTopN } from '$lib/site-catalog-contract';
import { ErrorCode, createErrorResponse } from '$lib/errors';

export async function GET({ params, url, fetch: customFetch, locals }) {
  try {
    const topNRaw = url.searchParams.get('topN');
    const topN = topNRaw != null ? clampResourceHealthTopN(Number.parseInt(topNRaw, 10)) : undefined;
    const health = await getSiteResourceHealth({
      siteId: params.siteId,
      topN,
      customFetch,
      requestId: locals.requestId,
    });
    if (!health) {
      return json(createErrorResponse(ErrorCode.NOT_FOUND, 'Site not found'), { status: 404 });
    }
    return json(health);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return json(createErrorResponse(ErrorCode.UPSTREAM_ERROR, msg), { status: 502 });
  }
}
