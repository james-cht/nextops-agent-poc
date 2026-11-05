import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { canOpenApplicationOnline } from '$lib/application-online';
import {
  createApplicationOnlineProject,
  listApplicationOnlineHome,
  type ActionFail,
} from '$lib/server/application-online-actions';
import { getApplicationOnlineStore } from '$lib/server/application-online-store';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';

function failStatus(code: ActionFail['code']): number {
  if (code === 'FORBIDDEN') return 403;
  if (code === 'CONFLICT') return 409;
  if (code === 'NOT_FOUND') return 404;
  return 400;
}

async function requireOnlineActor(operatorKey: string | null | undefined) {
  if (!operatorKey) {
    return {
      ok: false as const,
      response: json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), {
        status: 401,
      }),
    };
  }
  const settings = await ensureAppLocalSettings();
  const account = settings.getOperatorAccount(operatorKey);
  if (!account || account.disabled || !canOpenApplicationOnline(account.role)) {
    return {
      ok: false as const,
      response: json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Application Online access denied'), {
        status: 403,
      }),
    };
  }
  return { ok: true as const, settings, account };
}

export const GET: RequestHandler = async ({ locals }) => {
  const gate = await requireOnlineActor(locals.operatorKey);
  if (!gate.ok) return gate.response;
  const store = getApplicationOnlineStore();
  const home = listApplicationOnlineHome({
    store,
    account: gate.account,
    developerAccounts: gate.settings.listOperatorAccounts(),
  });
  return json(home);
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const gate = await requireOnlineActor(locals.operatorKey);
  if (!gate.ok) return gate.response;
  let body: { nameSpace?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid JSON body'), { status: 400 });
  }
  const nameSpace = typeof body.nameSpace === 'string' ? body.nameSpace : '';
  const result = createApplicationOnlineProject({
    store: getApplicationOnlineStore(),
    account: gate.account,
    nameSpace,
  });
  if (!result.ok) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, result.error), {
      status: failStatus(result.code),
    });
  }
  return json({ ok: true, project: result.project });
};
