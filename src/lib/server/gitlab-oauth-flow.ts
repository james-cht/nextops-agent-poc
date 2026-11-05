import { randomBytes } from 'node:crypto';
import { canRegisterApplication } from '../application-catalog.ts';
import { gitlabOAuthRedirectUri } from '../gitlab-settings-policy.ts';
import {
  buildGitLabAuthorizeUrl,
  exchangeGitLabAuthorizationCode,
  isGitLabAccessValid,
  type GitLabAccessRecord,
} from './gitlab-access.ts';
import type { LocalSettingsStore } from './local-settings-store.ts';

const PENDING_TTL_MS = 10 * 60 * 1000;

export type GitLabAccessStatus = {
  connected: boolean;
  expiresAt: string | null;
  valid: boolean;
};

export function gitlabAccessStatus(
  access: GitLabAccessRecord | null,
  now: Date = new Date(),
): GitLabAccessStatus {
  if (!access) return { connected: false, expiresAt: null, valid: false };
  return {
    connected: true,
    expiresAt: access.expiresAt,
    valid: isGitLabAccessValid(access, now),
  };
}

export type StartOAuthResult =
  | { ok: true; authorizeUrl: string }
  | { ok: false; code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'BAD_REQUEST'; error: string };

export function startGitLabOAuth(opts: {
  operatorKey: string | null | undefined;
  settings: LocalSettingsStore;
  publicOrigin: string;
  publicBasePath?: string | null;
  now?: Date;
  state?: string;
}): StartOAuthResult {
  const key = opts.operatorKey?.trim();
  if (!key) return { ok: false, code: 'UNAUTHORIZED', error: 'Session required' };
  const account = opts.settings.getOperatorAccount(key);
  if (!account || account.disabled) {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Session required' };
  }
  if (!canRegisterApplication(account.role)) {
    return { ok: false, code: 'FORBIDDEN', error: 'GitLab Access is not available for this role' };
  }
  const oauth = opts.settings.getGitLabOAuthClient();
  if (!oauth?.baseUrl || !oauth.clientId || !oauth.clientSecret) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: 'GitLab OAuth Client is not configured',
    };
  }
  const now = opts.now ?? new Date();
  const state = opts.state ?? randomBytes(24).toString('hex');
  opts.settings.putGitLabOAuthPending({
    state,
    username: account.username,
    expiresAt: new Date(now.getTime() + PENDING_TTL_MS).toISOString(),
  });
  const redirectUri = gitlabOAuthRedirectUri(opts.publicOrigin, opts.publicBasePath);
  return {
    ok: true,
    authorizeUrl: buildGitLabAuthorizeUrl({
      baseUrl: oauth.baseUrl,
      clientId: oauth.clientId,
      redirectUri,
      state,
    }),
  };
}

export type CompleteOAuthResult =
  | { ok: true; username: string }
  | { ok: false; code: 'BAD_REQUEST' | 'UNAUTHORIZED'; error: string };

export async function completeGitLabOAuthCallback(opts: {
  code: string | null | undefined;
  state: string | null | undefined;
  settings: LocalSettingsStore;
  publicOrigin: string;
  publicBasePath?: string | null;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<CompleteOAuthResult> {
  const code = opts.code?.trim();
  const state = opts.state?.trim();
  if (!code || !state) {
    return { ok: false, code: 'BAD_REQUEST', error: 'OAuth code and state are required' };
  }
  const now = opts.now ?? new Date();
  const pending = opts.settings.takeGitLabOAuthPending(state, now);
  if (!pending) {
    return { ok: false, code: 'BAD_REQUEST', error: 'OAuth state is invalid or expired' };
  }
  const oauth = opts.settings.getGitLabOAuthClient();
  if (!oauth?.baseUrl || !oauth.clientId || !oauth.clientSecret) {
    return { ok: false, code: 'BAD_REQUEST', error: 'GitLab OAuth Client is not configured' };
  }
  const exchanged = await exchangeGitLabAuthorizationCode({
    baseUrl: oauth.baseUrl,
    clientId: oauth.clientId,
    clientSecret: oauth.clientSecret,
    code,
    redirectUri: gitlabOAuthRedirectUri(opts.publicOrigin, opts.publicBasePath),
    fetchImpl: opts.fetchImpl,
    now,
  });
  if (!exchanged.ok) {
    return { ok: false, code: 'BAD_REQUEST', error: exchanged.error };
  }
  opts.settings.setGitLabAccess({
    username: pending.username,
    accessToken: exchanged.accessToken,
    refreshToken: exchanged.refreshToken,
    expiresAt: exchanged.expiresAt,
    now,
  });
  return { ok: true, username: pending.username };
}
