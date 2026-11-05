import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { canOpenApplicationOnline } from '$lib/application-online';
import {
  publishMergedSpecAndCreateDevJob,
  type ActionFail,
} from '$lib/server/application-online-actions';
import { getApplicationOnlineStore } from '$lib/server/application-online-store';
import { getCentralPipelineGitLabPort } from '$lib/server/central-pipeline-gitlab';
import { getKubeSphereJobPort } from '$lib/server/kubesphere-job';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';

function failStatus(code: ActionFail['code'] | 'GITLAB_ERROR' | 'KUBESPHERE_ERROR'): number {
  if (code === 'FORBIDDEN') return 403;
  if (code === 'CONFLICT' || code === 'NEEDS_CHOICE') return 409;
  if (code === 'NOT_FOUND') return 404;
  if (code === 'GITLAB_ERROR' || code === 'KUBESPHERE_ERROR') return 502;
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
  const gitlabPort = getCentralPipelineGitLabPort();
  const kubePort = getKubeSphereJobPort();
  const result = await publishMergedSpecAndCreateDevJob({
    store: getApplicationOnlineStore(),
    account,
    nameSpace: params.nameSpace,
    appName: params.appName,
    gitlab: gitlabPort.gitlab,
    kube: kubePort.kube,
    machineToken: gitlabPort.machineToken,
    centralProjectPath: gitlabPort.centralProjectPath,
    credentialIds: kubePort.credentialIds,
  });
  if (!result.ok) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, result.error), {
      status: failStatus(result.code),
    });
  }
  return json({
    ok: true,
    publishedPinSha: result.publishedPinSha,
    devJobId: result.devJobId,
  });
};
