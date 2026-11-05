import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';
import type { OperatorRole } from '$lib/server/local-settings-store';
import { operatorAccountSummary } from '$lib/server/operator-account-summary';

function requireOwner(operatorKey: string | null | undefined) {
  if (!operatorKey) return null;
  return operatorKey;
}

export const GET: RequestHandler = async ({ locals }) => {
  const store = await ensureAppLocalSettings();
  const actor = requireOwner(locals.operatorKey);
  if (!actor) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  const account = store.getOperatorAccount(actor);
  if (!account || account.role !== 'platform_owner' || account.disabled) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Platform Owner required'), {
      status: 403,
    });
  }
  return json({
    accounts: store
      .listOperatorAccounts()
      .map((account) => operatorAccountSummary(store, account.username))
      .filter((row) => row !== null),
    unmatchedLoginEvents: store.listUnmatchedLoginEvents(),
    sessions: {
      fleet: store.countSessions(),
    },
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const store = await ensureAppLocalSettings();
  const actor = requireOwner(locals.operatorKey);
  if (!actor) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  let body: { username?: unknown; email?: unknown; displayName?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid JSON body'), { status: 400 });
  }
  const username = typeof body.username === 'string' ? body.username : '';
  const email = typeof body.email === 'string' ? body.email : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName : '';
  const role = body.role as OperatorRole;
  const result = await store.createOperatorAccount({
    actorUsername: actor,
    username,
    email,
    displayName,
    role,
  });
  if (!result.ok) {
    const status = result.code === 'FORBIDDEN' ? 403 : result.code === 'CONFLICT' ? 409 : 400;
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, result.error), { status });
  }
  return json({
    ok: true,
    username: username.trim(),
    temporaryPassword: result.temporaryPassword,
  });
};
