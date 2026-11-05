import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { canOpenApplicationOnline } from '$lib/application-online';
import {
  releaseNextHop,
  type ActionFail,
  type KubeSphereHopJobPort,
} from '$lib/server/application-online-actions';
import { getApplicationOnlineStore } from '$lib/server/application-online-store';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';

function failStatus(code: ActionFail['code'] | 'KUBESPHERE_ERROR'): number {
  if (code === 'FORBIDDEN') return 403;
  if (code === 'CONFLICT' || code === 'NEEDS_CHOICE') return 409;
  if (code === 'NOT_FOUND') return 404;
  if (code === 'KUBESPHERE_ERROR') return 502;
  return 400;
}

const stubKube: KubeSphereHopJobPort = {
  async createPipelineJob(job) {
    return { ok: true, jobId: `job-${job.name}` };
  },
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
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
  let body: { targetEnvironment?: unknown; imageTag?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid JSON body'), { status: 400 });
  }
  const targetEnvironment =
    typeof body.targetEnvironment === 'string' ? body.targetEnvironment : '';
  const imageTag = typeof body.imageTag === 'string' ? body.imageTag : '';
  const result = await releaseNextHop({
    store: getApplicationOnlineStore(),
    account,
    nameSpace: params.nameSpace,
    appName: params.appName,
    targetEnvironment,
    imageTag,
    credentialIds: [],
    kubeSphere: stubKube,
  });
  if (!result.ok) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, result.error), {
      status: failStatus(result.code),
    });
  }
  return json({
    ok: true,
    jobId: result.jobId,
    pinSha: result.pinSha,
    sourceImage: result.sourceImage,
  });
};
