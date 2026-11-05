import type { ConfigAuditStore } from './config-audit-log.ts';
import { appendConfigAuditEntry } from './config-audit-log.ts';
import type { ProbeResult } from './gitlab-credential-probes.ts';
import type { LocalSettingsStore } from './local-settings-store.ts';
import {
  mergeGitLabOAuthClientPatch,
  mergeGitLabReadAccessPatch,
  type GitLabOAuthClientValues,
  type GitLabReadAccessValues,
} from '../gitlab-settings-policy.ts';

export type GitLabAdminApplyOk = { ok: true };
export type GitLabAdminApplyErr = {
  ok: false;
  code: 'UNAUTHORIZED' | 'BAD_REQUEST' | 'TEST_FAILED';
  error: string;
};
export type GitLabAdminApplyResult = GitLabAdminApplyOk | GitLabAdminApplyErr;

type StepUpDeps = {
  adminPassword: string;
  verifyStepUp: (password: string) => Promise<boolean>;
  actor: string;
  store: LocalSettingsStore & ConfigAuditStore;
  logLine?: (line: string) => void;
};

async function requirePassword(
  deps: StepUpDeps,
  setting: string,
  action: 'save' | 'restore',
): Promise<GitLabAdminApplyErr | null> {
  const ok = await deps.verifyStepUp(deps.adminPassword);
  if (!ok) {
    appendConfigAuditEntry(
      {
        action,
        setting,
        outcome: 'rejected',
        actor: deps.actor,
        detail: { reason: 'bad_password' },
      },
      { store: deps.store, logLine: deps.logLine },
    );
    return { ok: false, code: 'UNAUTHORIZED', error: 'Admin password required' };
  }
  return null;
}

export async function applyGitLabOAuthClientSave(
  deps: StepUpDeps & {
    patch: Partial<GitLabOAuthClientValues>;
    probeOAuthClient: (c: GitLabOAuthClientValues) => Promise<ProbeResult>;
  },
): Promise<GitLabAdminApplyResult> {
  const authErr = await requirePassword(deps, 'gitlab_oauth_client', 'save');
  if (authErr) return authErr;

  const previous = deps.store.getGitLabOAuthClient();
  const current: GitLabOAuthClientValues = previous ?? {
    baseUrl: '',
    clientId: '',
    clientSecret: '',
  };
  const next = mergeGitLabOAuthClientPatch(current, deps.patch);
  if (!next.baseUrl || !next.clientId || !next.clientSecret) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: 'GitLab OAuth Client base URL, client id, and secret are required',
    };
  }

  deps.store.setGitLabOAuthClient(next);
  const probe = await deps.probeOAuthClient(next);
  if (!probe.ok) {
    if (previous) deps.store.setGitLabOAuthClient(previous);
    else deps.store.clearGitLabOAuthClient();
    appendConfigAuditEntry(
      {
        action: 'save',
        setting: 'gitlab_oauth_client',
        outcome: 'test_failed',
        actor: deps.actor,
        detail: { probe: 'gitlab_oauth_client', error: probe.error },
      },
      { store: deps.store, logLine: deps.logLine },
    );
    return { ok: false, code: 'TEST_FAILED', error: probe.error };
  }

  appendConfigAuditEntry(
    {
      action: 'save',
      setting: 'gitlab_oauth_client',
      outcome: 'saved',
      actor: deps.actor,
      detail: { baseUrl: next.baseUrl, clientId: next.clientId, secretChanged: true },
    },
    { store: deps.store, logLine: deps.logLine },
  );
  return { ok: true };
}

export async function applyGitLabReadAccessSave(
  deps: StepUpDeps & {
    patch: Partial<GitLabReadAccessValues>;
    probeReadAccess: (c: GitLabReadAccessValues & { baseUrl: string }) => Promise<ProbeResult>;
    oauthBaseUrl?: string;
  },
): Promise<GitLabAdminApplyResult> {
  const authErr = await requirePassword(deps, 'gitlab_read_access', 'save');
  if (authErr) return authErr;

  const previous = deps.store.getGitLabReadAccess();
  const current: GitLabReadAccessValues = previous ?? { token: '' };
  const next = mergeGitLabReadAccessPatch(current, deps.patch);
  if (!next.token) {
    return { ok: false, code: 'BAD_REQUEST', error: 'GitLab Read Access token is required' };
  }

  const baseUrl =
    deps.oauthBaseUrl?.replace(/\/$/, '') ||
    deps.store.getGitLabOAuthClient()?.baseUrl.replace(/\/$/, '') ||
    '';
  if (!baseUrl) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: 'Configure GitLab OAuth Client base URL before GitLab Read Access',
    };
  }

  deps.store.setGitLabReadAccess(next);
  const probe = await deps.probeReadAccess({ ...next, baseUrl });
  if (!probe.ok) {
    if (previous) deps.store.setGitLabReadAccess(previous);
    else deps.store.clearGitLabReadAccess();
    appendConfigAuditEntry(
      {
        action: 'save',
        setting: 'gitlab_read_access',
        outcome: 'test_failed',
        actor: deps.actor,
        detail: { probe: 'gitlab_read_access', error: probe.error },
      },
      { store: deps.store, logLine: deps.logLine },
    );
    return { ok: false, code: 'TEST_FAILED', error: probe.error };
  }

  appendConfigAuditEntry(
    {
      action: 'save',
      setting: 'gitlab_read_access',
      outcome: 'saved',
      actor: deps.actor,
      detail: { tokenChanged: true },
    },
    { store: deps.store, logLine: deps.logLine },
  );
  return { ok: true };
}
