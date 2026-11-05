import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { canOpenApplicationOnline } from '$lib/application-online';
import { saveServiceDeploySpecArtifacts, type ActionFail } from '$lib/server/application-online-actions';
import { getApplicationOnlineStore } from '$lib/server/application-online-store';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';

function failStatus(code: ActionFail['code']): number {
  if (code === 'FORBIDDEN') return 403;
  if (code === 'CONFLICT' || code === 'NEEDS_CHOICE') return 409;
  if (code === 'NOT_FOUND') return 404;
  return 400;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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
  const runtimeEnv =
    body.runtimeEnv && typeof body.runtimeEnv === 'object' && !Array.isArray(body.runtimeEnv)
      ? Object.fromEntries(
          Object.entries(body.runtimeEnv as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : {};
  const dockerfileChoice =
    body.dockerfileChoice === 'regenerate' || body.dockerfileChoice === 'keep-manual'
      ? body.dockerfileChoice
      : undefined;
  const kustomizeChoice =
    body.kustomizeChoice === 'regenerate' || body.kustomizeChoice === 'keep-manual'
      ? body.kustomizeChoice
      : undefined;
  const result = saveServiceDeploySpecArtifacts({
    store: getApplicationOnlineStore(),
    account,
    nameSpace: params.nameSpace,
    appName: asString(body.appName) || params.appName,
    generate: {
      baseImage: asString(body.baseImage),
      artifactPath: asString(body.artifactPath) || 'target/*.jar',
      workdir: asString(body.workdir) || '/app',
      entrypoint: asString(body.entrypoint) || '["java","-jar","/app/app.jar"]',
      port: asNumber(body.port, 8080),
      replicas: asNumber(body.replicas, 1),
      cpu: asString(body.cpu) || '500m',
      memory: asString(body.memory) || '1Gi',
      runtimeEnv,
    },
    dockerfileChoice,
    kustomizeChoice,
    handEditedDockerfile:
      typeof body.handEditedDockerfile === 'string' ? body.handEditedDockerfile : undefined,
  });
  if (!result.ok) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, result.error), {
      status: failStatus(result.code),
    });
  }
  return json({ ok: true, artifacts: result.artifacts });
};
