import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';

export const PUT: RequestHandler = async ({ locals, request }) => {
  const store = await ensureAppLocalSettings();
  const key = locals.operatorKey;
  if (!key) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  let body: { currentPassword?: unknown; newPassword?: unknown; totpCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid JSON body'), { status: 400 });
  }
  const result = await store.changeOwnLastingPassword({
    username: key,
    currentPassword: typeof body.currentPassword === 'string' ? body.currentPassword : '',
    newPassword: typeof body.newPassword === 'string' ? body.newPassword : '',
    totpCode: typeof body.totpCode === 'string' ? body.totpCode : undefined,
  });
  if (!result.ok) {
    const status = result.code === 'UNAUTHORIZED' ? 401 : 400;
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, result.error), { status });
  }
  return json({ ok: true });
};
