import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { toToolEndpointAdminPayload } from '$lib/dify-credentials-format';
import {
  applyDifyCredentialsRestore,
  applyDifyCredentialsSave,
} from '$lib/server/dify-credentials-admin';
import {
  envValuesFromProcess,
  getEffectiveDifyCredentials,
} from '$lib/server/dify-credentials';
import { probeToolEndpointToken } from '$lib/server/dify-credential-probes';
import {
  ensureAppLocalSettings,
  verifyStepUpPassword,
} from '$lib/server/app-local-settings';

function requestOrigin(url: URL, request: Request): string {
  const forwarded = request.headers.get('x-forwarded-proto');
  const proto = forwarded?.split(',')[0]?.trim() || url.protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  if (env.ORIGIN) return env.ORIGIN.replace(/\/$/, '');
  return `${proto}://${host}`;
}

async function maskedPayload() {
  const store = await ensureAppLocalSettings();
  const snap = getEffectiveDifyCredentials({ env: envValuesFromProcess(env), store });
  return toToolEndpointAdminPayload({
    toolToken: snap.toolToken,
    source: snap.source,
  });
}

export const GET: RequestHandler = async () => {
  return json(await maskedPayload());
};

export const PUT: RequestHandler = async ({ request, url }) => {
  let body: {
    adminPassword?: unknown;
    toolToken?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid JSON body'), { status: 400 });
  }

  const store = await ensureAppLocalSettings();
  const actor = store.getAdminUsername() ?? 'admin';

  const result = await applyDifyCredentialsSave({
    adminPassword: typeof body.adminPassword === 'string' ? body.adminPassword : '',
    verifyStepUp: verifyStepUpPassword,
    actor,
    store,
    patch: {
      toolToken: typeof body.toolToken === 'string' ? body.toolToken : undefined,
    },
    env: envValuesFromProcess(env),
    origin: requestOrigin(url, request),
    probeTool: (c) => probeToolEndpointToken(c),
  });

  if (!result.ok) {
    const status =
      result.code === 'UNAUTHORIZED' ? 401 : result.code === 'TEST_FAILED' ? 502 : 400;
    return json(
      createErrorResponse(
        result.code === 'UNAUTHORIZED'
          ? ErrorCode.UNAUTHORIZED
          : result.code === 'TEST_FAILED'
            ? ErrorCode.UPSTREAM_ERROR
            : ErrorCode.BAD_REQUEST,
        result.error,
      ),
      { status },
    );
  }

  return json({ ...(await maskedPayload()), notice: '一經修改即會生效' });
};

export const DELETE: RequestHandler = async ({ request, url }) => {
  let body: { adminPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid JSON body'), { status: 400 });
  }

  const store = await ensureAppLocalSettings();
  const actor = store.getAdminUsername() ?? 'admin';

  const result = await applyDifyCredentialsRestore({
    adminPassword: typeof body.adminPassword === 'string' ? body.adminPassword : '',
    verifyStepUp: verifyStepUpPassword,
    actor,
    store,
    env: envValuesFromProcess(env),
    origin: requestOrigin(url, request),
    probeTool: (c) => probeToolEndpointToken(c),
  });

  if (!result.ok) {
    const status =
      result.code === 'UNAUTHORIZED' ? 401 : result.code === 'TEST_FAILED' ? 502 : 400;
    return json(
      createErrorResponse(
        result.code === 'UNAUTHORIZED'
          ? ErrorCode.UNAUTHORIZED
          : result.code === 'TEST_FAILED'
            ? ErrorCode.UPSTREAM_ERROR
            : ErrorCode.BAD_REQUEST,
        result.error,
      ),
      { status },
    );
  }

  return json({ ...(await maskedPayload()), notice: '一經修改即會生效' });
};
