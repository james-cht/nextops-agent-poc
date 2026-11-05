import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { getApplicationStore } from '$lib/server/application-store';
import { unregisterApplication } from '$lib/server/application-unregistration';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const settings = await ensureAppLocalSettings();
  const result = unregisterApplication({
    operatorKey: locals.operatorKey,
    settings,
    apps: getApplicationStore(),
    name: params.name ?? '',
  });
  if (!result.ok) {
    const status =
      result.code === 'UNAUTHORIZED'
        ? 401
        : result.code === 'FORBIDDEN'
          ? 403
          : result.code === 'NOT_FOUND'
            ? 404
            : 400;
    const code =
      result.code === 'UNAUTHORIZED' || result.code === 'FORBIDDEN'
        ? ErrorCode.UNAUTHORIZED
        : result.code === 'NOT_FOUND'
          ? ErrorCode.NOT_FOUND
          : ErrorCode.BAD_REQUEST;
    return json(createErrorResponse(code, result.error), { status });
  }
  return json({ ok: true });
};
