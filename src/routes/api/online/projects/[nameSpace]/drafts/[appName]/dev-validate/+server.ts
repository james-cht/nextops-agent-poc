import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { canOpenApplicationOnline } from '$lib/application-online';
import { triggerDevValidate, type ActionFail } from '$lib/server/application-online-actions';
import { getApplicationOnlineStore } from '$lib/server/application-online-store';
import { getJenkinsDevRunPort } from '$lib/server/jenkins-dev-run';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';

function failStatus(code: ActionFail['code'] | 'JENKINS_ERROR'): number {
  if (code === 'FORBIDDEN') return 403;
  if (code === 'CONFLICT' || code === 'NEEDS_CHOICE') return 409;
  if (code === 'NOT_FOUND') return 404;
  if (code === 'JENKINS_ERROR') return 502;
  return 400;
}

export const POST: RequestHandler = async ({ locals, params }) => {
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
  const result = await triggerDevValidate({
    store: getApplicationOnlineStore(),
    account,
    nameSpace: params.nameSpace,
    appName: params.appName,
    jenkins: getJenkinsDevRunPort(),
  });
  if (!result.ok) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, result.error), {
      status: failStatus(result.code),
    });
  }
  return json({ ok: true, runId: result.runId, status: result.status });
};
