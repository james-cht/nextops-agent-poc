import { json } from '@sveltejs/kit';
import { getSiteSnapshot } from '$lib/server/site-catalog';
import { ErrorCode, createErrorResponse } from '$lib/errors';

export async function GET({ params, url, locals, fetch }) {
  try {
    const snapshot = await getSiteSnapshot({
      siteId: params.siteId,
      searchParams: url.searchParams,
      customFetch: fetch,
      requestId: locals.requestId,
    });
    if (!snapshot) return json(createErrorResponse(ErrorCode.NOT_FOUND, 'Site not found'), { status: 404 });
    return json(snapshot);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return json(createErrorResponse(ErrorCode.UPSTREAM_ERROR, msg), { status: 502 });
  }
}
