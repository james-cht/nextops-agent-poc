import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { canOpenApplicationOnline } from '$lib/application-online';
import { saveServiceDeploySpecDraft, type ActionFail } from '$lib/server/application-online-actions';
import { getApplicationOnlineStore } from '$lib/server/application-online-store';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';

function failStatus(code: ActionFail['code']): number {
  if (code === 'FORBIDDEN') return 403;
  if (code === 'CONFLICT') return 409;
  if (code === 'NOT_FOUND') return 404;
  return 400;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export const PUT: RequestHandler = async ({ locals, params, request }) => {
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
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid JSON body'), { status: 400 });
  }
  const result = saveServiceDeploySpecDraft({
    store: getApplicationOnlineStore(),
    account,
    input: {
      nameSpace: params.nameSpace,
      appName: asString(body.appName),
      gitlabUrl: asString(body.gitlabUrl),
      promotionPath: asString(body.promotionPath),
      templateFamily: asString(body.templateFamily),
      packagingCommand: asString(body.packagingCommand),
      defaultRef: asString(body.defaultRef),
      k8sNamespace: asString(body.k8sNamespace),
    },
  });
  if (!result.ok) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, result.error), {
      status: failStatus(result.code),
    });
  }
  return json({
    ok: true,
    draft: result.draft,
    pipelineBlockComplete: result.pipelineBlockComplete,
  });
};
