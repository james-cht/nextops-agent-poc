import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { base } from '$app/paths';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { canRegisterApplication } from '$lib/application-catalog';
import { gitlabOAuthRedirectUri, normalizePublicOrigin } from '$lib/gitlab-settings-policy';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';
import { gitlabAccessStatus } from '$lib/server/gitlab-oauth-flow';
import { operatorAccountSummary } from '$lib/server/operator-account-summary';

function requestOrigin(url: URL, request: Request): string {
  const forwarded = request.headers.get('x-forwarded-proto');
  const proto = forwarded?.split(',')[0]?.trim() || url.protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  if (env.ORIGIN) return normalizePublicOrigin(env.ORIGIN);
  return normalizePublicOrigin(`${proto}://${host}`);
}

export const GET: RequestHandler = async ({ locals, url, request }) => {
  const store = await ensureAppLocalSettings();
  const key = locals.operatorKey;
  if (!key) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  const summary = operatorAccountSummary(store, key);
  if (!summary || summary.disabled) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  const showGitLabAccess = canRegisterApplication(summary.role);
  return json({
    account: summary,
    currentSessionId: locals.sessionId ?? null,
    sessions: store.listSessions({ username: key }),
    loginEvents: store.listLoginEvents({ username: key }),
    gitlabAccess: showGitLabAccess
      ? gitlabAccessStatus(store.getGitLabAccess(key))
      : null,
    oauthRedirectUri: showGitLabAccess
      ? gitlabOAuthRedirectUri(requestOrigin(url, request), base)
      : null,
  });
};
