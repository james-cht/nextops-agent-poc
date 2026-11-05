import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';
import { operatorAccountSummary } from '$lib/server/operator-account-summary';
import type { OperatorRole } from '$lib/server/local-settings-store';

function requireOwner(store: Awaited<ReturnType<typeof ensureAppLocalSettings>>, key: string | null | undefined) {
  if (!key) return null;
  const account = store.getOperatorAccount(key);
  if (!account || account.disabled || account.role !== 'platform_owner') return null;
  return account;
}

export const GET: RequestHandler = async ({ locals, params }) => {
  const store = await ensureAppLocalSettings();
  const actor = requireOwner(store, locals.operatorKey);
  if (!actor) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Platform Owner required'), {
      status: 403,
    });
  }
  const username = decodeURIComponent(params.username);
  const summary = operatorAccountSummary(store, username);
  if (!summary) {
    return json(createErrorResponse(ErrorCode.NOT_FOUND, 'Operator Account not found'), {
      status: 404,
    });
  }
  return json({
    account: summary,
    sessions: store.listSessions({ username }),
    loginEvents: store.listLoginEvents({ username }),
  });
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const store = await ensureAppLocalSettings();
  const actor = requireOwner(store, locals.operatorKey);
  if (!actor) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Platform Owner required'), {
      status: 403,
    });
  }
  let body: { email?: unknown; displayName?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid JSON body'), { status: 400 });
  }
  const result = store.updateOperatorAccount({
    actorUsername: actor.username,
    username: decodeURIComponent(params.username),
    email: typeof body.email === 'string' ? body.email : undefined,
    displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
    role: body.role as OperatorRole | undefined,
  });
  if (!result.ok) {
    const status =
      result.code === 'FORBIDDEN' ? 403 : result.code === 'CONFLICT' ? 409 : 400;
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, result.error), { status });
  }
  return json({ ok: true });
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
  const store = await ensureAppLocalSettings();
  const actor = requireOwner(store, locals.operatorKey);
  if (!actor) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Platform Owner required'), {
      status: 403,
    });
  }
  let body: { action?: unknown; totpCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid JSON body'), { status: 400 });
  }
  const username = decodeURIComponent(params.username);
  const action = typeof body.action === 'string' ? body.action : '';
  const totpCode = typeof body.totpCode === 'string' ? body.totpCode : undefined;

  if (action === 'disable') {
    const result = store.disableOperatorAccount({ actorUsername: actor.username, username });
    if (!result.ok) {
      return json(createErrorResponse(ErrorCode.BAD_REQUEST, result.error), {
        status: result.code === 'FORBIDDEN' ? 403 : 400,
      });
    }
    return json({ ok: true });
  }
  if (action === 'enable') {
    const result = store.enableOperatorAccount({ actorUsername: actor.username, username });
    if (!result.ok) {
      return json(createErrorResponse(ErrorCode.BAD_REQUEST, result.error), {
        status: result.code === 'FORBIDDEN' ? 403 : 400,
      });
    }
    return json({ ok: true });
  }
  if (action === 'reset-password') {
    const result = await store.resetOperatorPassword({
      actorUsername: actor.username,
      username,
    });
    if (!result.ok) {
      return json(createErrorResponse(ErrorCode.BAD_REQUEST, result.error), {
        status: result.code === 'FORBIDDEN' ? 403 : 400,
      });
    }
    return json({ ok: true, temporaryPassword: result.temporaryPassword });
  }
  if (action === 'clear-second-factor') {
    const result = store.clearSecondFactor({
      actorUsername: actor.username,
      username,
      totpCode,
    });
    if (!result.ok) {
      const status = result.code === 'UNAUTHORIZED' ? 401 : result.code === 'FORBIDDEN' ? 403 : 400;
      return json(createErrorResponse(ErrorCode.BAD_REQUEST, result.error), { status });
    }
    return json({ ok: true });
  }
  if (action === 'clear-lockout') {
    const result = store.clearLoginLockout({ actorUsername: actor.username, username });
    if (!result.ok) {
      return json(createErrorResponse(ErrorCode.BAD_REQUEST, result.error), {
        status: result.code === 'FORBIDDEN' ? 403 : 400,
      });
    }
    return json({ ok: true });
  }
  return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Unknown action'), { status: 400 });
};
