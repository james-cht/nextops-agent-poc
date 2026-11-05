import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { canOpenApplicationOnline } from '$lib/application-online';
import { removeProjectMembership, type ActionFail } from '$lib/server/application-online-actions';
import { getApplicationOnlineStore } from '$lib/server/application-online-store';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';

function failStatus(code: ActionFail['code']): number {
  if (code === 'FORBIDDEN') return 403;
  if (code === 'CONFLICT') return 409;
  if (code === 'NOT_FOUND') return 404;
  return 400;
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.operatorKey) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  const settings = await ensureAppLocalSettings();
  const account = settings.getOperatorAccount(locals.operatorKey);
  if (!account || account.disabled || !canOpenApplicationOnline(account.role)) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Application Online access denied'), {
      status: 403,
    });
  }
  const result = removeProjectMembership({
    store: getApplicationOnlineStore(),
    account,
    nameSpace: params.nameSpace,
    username: params.username,
  });
  if (!result.ok) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, result.error), {
      status: failStatus(result.code),
    });
  }
  return json({ ok: true });
};
