import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';
import { generateTotpSecret } from '$lib/server/totp';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.operatorKey) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  return json({ secret: generateTotpSecret() });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const store = await ensureAppLocalSettings();
  const key = locals.operatorKey;
  if (!key) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  let body: { secret?: unknown; code?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid JSON body'), { status: 400 });
  }
  const secret = typeof body.secret === 'string' ? body.secret : '';
  const code = typeof body.code === 'string' ? body.code : '';
  const result = store.enrollSecondFactor({ username: key, secret, code });
  if (!result.ok) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Second Factor enroll failed'), {
      status: 400,
    });
  }
  return json({ ok: true });
};
