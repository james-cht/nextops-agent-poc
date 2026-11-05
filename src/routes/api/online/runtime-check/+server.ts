import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { recordRuntimeCheckCallback } from '$lib/server/application-online-actions';
import { getApplicationOnlineStore } from '$lib/server/application-online-store';

export const POST: RequestHandler = async ({ request }) => {
  const provided =
    request.headers.get('x-idp-callback-token') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    null;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid JSON body'), { status: 400 });
  }
  const result = recordRuntimeCheckCallback({
    store: getApplicationOnlineStore(),
    expectedToken: process.env.NEXTOPS_IDP_CALLBACK_TOKEN,
    providedToken: provided,
    body,
  });
  if (!result.ok) {
    const status = result.code === 'UNAUTHORIZED' ? 401 : result.code === 'NOT_FOUND' ? 404 : 400;
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, result.error), { status });
  }
  return json({ ok: true, ready: result.ready });
};
