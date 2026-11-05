import { json } from '@sveltejs/kit';
import { listSiteCatalog } from '$lib/server/site-catalog';
import { ErrorCode, createErrorResponse } from '$lib/errors';

export function GET() {
  try {
    const sites = listSiteCatalog();
    return json(sites);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return json(createErrorResponse(ErrorCode.INTERNAL_ERROR, msg), { status: 500 });
  }
}
