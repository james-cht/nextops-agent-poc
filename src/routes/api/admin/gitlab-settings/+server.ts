import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { base } from '$app/paths';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { toGitLabSettingsAdminPayload } from '$lib/gitlab-settings-format';
import {
  applyGitLabOAuthClientSave,
  applyGitLabReadAccessSave,
} from '$lib/server/gitlab-settings-admin';
import {
  probeGitLabOAuthBase,
  probeGitLabReadAccess,
} from '$lib/server/gitlab-credential-probes';
import {
  ensureAppLocalSettings,
  verifyStepUpPassword,
} from '$lib/server/app-local-settings';
import { ownerError, requirePlatformOwner } from '$lib/server/require-platform-owner';
import { normalizePublicOrigin } from '$lib/gitlab-settings-policy';

function requestOrigin(url: URL, request: Request): string {
  const forwarded = request.headers.get('x-forwarded-proto');
  const proto = forwarded?.split(',')[0]?.trim() || url.protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  if (env.ORIGIN) return normalizePublicOrigin(env.ORIGIN);
  return normalizePublicOrigin(`${proto}://${host}`);
}

async function maskedPayload(publicOrigin: string) {
  const store = await ensureAppLocalSettings();
  return toGitLabSettingsAdminPayload({
    oauth: store.getGitLabOAuthClient(),
    readAccess: store.getGitLabReadAccess(),
    publicOrigin,
    publicBasePath: base,
  });
}

export const GET: RequestHandler = async ({ locals, url, request }) => {
  const store = await ensureAppLocalSettings();
  const gate = requirePlatformOwner(store, locals.operatorKey);
  if (!gate.ok) return ownerError(gate);
  return json(await maskedPayload(requestOrigin(url, request)));
};

export const PUT: RequestHandler = async ({ request, url, locals }) => {
  let body: {
    adminPassword?: unknown;
    kind?: unknown;
    baseUrl?: unknown;
    clientId?: unknown;
    clientSecret?: unknown;
    token?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid JSON body'), { status: 400 });
  }

  const store = await ensureAppLocalSettings();
  const gate = requirePlatformOwner(store, locals.operatorKey);
  if (!gate.ok) return ownerError(gate);

  const kind = body.kind === 'read_access' ? 'read_access' : 'oauth_client';
  const adminPassword = typeof body.adminPassword === 'string' ? body.adminPassword : '';

  const result =
    kind === 'oauth_client'
      ? await applyGitLabOAuthClientSave({
          adminPassword,
          verifyStepUp: verifyStepUpPassword,
          actor: gate.username,
          store,
          patch: {
            baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
            clientId: typeof body.clientId === 'string' ? body.clientId : undefined,
            clientSecret: typeof body.clientSecret === 'string' ? body.clientSecret : undefined,
          },
          probeOAuthClient: (c) =>
            probeGitLabOAuthBase({
              baseUrl: c.baseUrl,
              clientId: c.clientId,
              clientSecret: c.clientSecret,
              redirectUri: toGitLabSettingsAdminPayload({
                oauth: c,
                readAccess: null,
                publicOrigin: requestOrigin(url, request),
                publicBasePath: base,
              }).oauthRedirectUri,
            }),
        })
      : await applyGitLabReadAccessSave({
          adminPassword,
          verifyStepUp: verifyStepUpPassword,
          actor: gate.username,
          store,
          patch: {
            token: typeof body.token === 'string' ? body.token : undefined,
          },
          probeReadAccess: (c) =>
            probeGitLabReadAccess({ baseUrl: c.baseUrl, token: c.token }),
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

  return json({
    ...(await maskedPayload(requestOrigin(url, request))),
    notice: '一經修改即會生效',
  });
};
