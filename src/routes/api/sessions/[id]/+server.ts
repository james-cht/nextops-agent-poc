import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { base } from '$app/paths';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { kitPathsBase } from '$lib/public-base-path';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';

export const DELETE: RequestHandler = async ({ locals, params, cookies }) => {
  const store = await ensureAppLocalSettings();
  const key = locals.operatorKey;
  if (!key) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  const actor = store.getOperatorAccount(key);
  if (!actor || actor.disabled) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  const id = decodeURIComponent(params.id);
  const session = store.getSession(id);
  if (!session) {
    return json(createErrorResponse(ErrorCode.NOT_FOUND, 'Session not found'), { status: 404 });
  }
  const own = session.username === actor.username;
  if (!own && actor.role !== 'platform_owner') {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Forbidden'), { status: 403 });
  }
  store.revokeSession(id);
  const currentRevoked = cookies.get('session') === id;
  if (currentRevoked) {
    cookies.delete('session', { path: kitPathsBase(base) || '/' });
  }
  return json({ ok: true, currentRevoked });
};
