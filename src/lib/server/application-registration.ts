import { canRegisterApplication } from '../application-catalog.ts';
import { isGitLabAccessValid } from './gitlab-access.ts';
import type { ApplicationRecord, ApplicationStore } from './application-store.ts';
import type { LocalSettingsStore } from './local-settings-store.ts';

export type GitLabRegistrationPort = {
  proveCanAttach(opts: {
    accessToken: string;
    projectPath: string;
  }): Promise<{ ok: true } | { ok: false; error: string }>;
  grantReadAccess(opts: {
    accessToken: string;
    projectPath: string;
    readAccessToken: string;
  }): Promise<{ ok: true } | { ok: false; error: string }>;
  createProject(opts: {
    accessToken: string;
    projectPath: string;
    visibility?: string;
    defaultBranch?: string;
    description?: string;
  }): Promise<{ ok: true } | { ok: false; error: string }>;
  writeFirstCommit(opts: {
    accessToken: string;
    projectPath: string;
    defaultBranch: string;
    commitMessage: string;
    files: Array<{ path: string; content: string }>;
  }): Promise<{ ok: true } | { ok: false; error: string }>;
};

export type RegisterApplicationInput = {
  mode: 'attach' | 'create';
  name: string;
  gitlabProjectPath: string;
  /** Create-only: files for the first commit (already unpacked). */
  files?: Array<{ path: string; content: string }>;
  advanced?: {
    visibility?: 'private' | 'internal' | 'public';
    defaultBranch?: string;
    description?: string;
    gitignoreTemplate?: string;
    commitMessage?: string;
  };
};

export type RegisterApplicationResult =
  | { ok: true; application: ApplicationRecord }
  | {
      ok: false;
      code:
        | 'UNAUTHORIZED'
        | 'FORBIDDEN'
        | 'BAD_REQUEST'
        | 'CONFLICT'
        | 'GITLAB_REAUTH'
        | 'GITLAB_ERROR';
      error: string;
    };

function normalizePath(gitlabProjectPath: string): string {
  return gitlabProjectPath.trim().replace(/^\/+|\/+$/g, '');
}

export async function registerApplication(opts: {
  operatorKey: string | null | undefined;
  settings: LocalSettingsStore;
  apps: ApplicationStore;
  gitlab: GitLabRegistrationPort;
  input: RegisterApplicationInput;
  now?: Date;
}): Promise<RegisterApplicationResult> {
  const key = opts.operatorKey?.trim();
  if (!key) return { ok: false, code: 'UNAUTHORIZED', error: 'Session required' };
  const account = opts.settings.getOperatorAccount(key);
  if (!account || account.disabled) {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Session required' };
  }
  if (!canRegisterApplication(account.role)) {
    return { ok: false, code: 'FORBIDDEN', error: 'Application Registration is not allowed for this role' };
  }

  const name = opts.input.name.trim();
  const gitlabProjectPath = normalizePath(opts.input.gitlabProjectPath);
  if (!name || !gitlabProjectPath) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: 'Application name and GitLab Project path are required',
    };
  }
  if (opts.input.mode !== 'attach' && opts.input.mode !== 'create') {
    return { ok: false, code: 'BAD_REQUEST', error: 'mode must be attach or create' };
  }

  const now = opts.now ?? new Date();
  const access = opts.settings.getGitLabAccess(account.username);
  if (!isGitLabAccessValid(access, now)) {
    return {
      ok: false,
      code: 'GITLAB_REAUTH',
      error: 'GitLab Access required — re-authorize GitLab without ending Session',
    };
  }

  const readAccess = opts.settings.getGitLabReadAccess();
  const oauth = opts.settings.getGitLabOAuthClient();
  if (!readAccess?.token || !oauth?.baseUrl) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: 'GitLab Read Access and GitLab OAuth Client must be configured',
    };
  }

  // Pre-check uniqueness so we fail before mutating GitLab when possible.
  const existing = opts.apps.listApplications();
  if (
    existing.some(
      (a) =>
        a.name.toLowerCase() === name.toLowerCase() ||
        a.gitlabProjectPath.toLowerCase() === gitlabProjectPath.toLowerCase(),
    )
  ) {
    return {
      ok: false,
      code: 'CONFLICT',
      error: 'Application name or GitLab Project path already registered',
    };
  }

  if (opts.input.mode === 'attach') {
    const proved = await opts.gitlab.proveCanAttach({
      accessToken: access!.accessToken,
      projectPath: gitlabProjectPath,
    });
    if (!proved.ok) {
      return { ok: false, code: 'GITLAB_ERROR', error: proved.error };
    }
  } else {
    const created = await opts.gitlab.createProject({
      accessToken: access!.accessToken,
      projectPath: gitlabProjectPath,
      visibility: opts.input.advanced?.visibility,
      defaultBranch: opts.input.advanced?.defaultBranch,
      description: opts.input.advanced?.description,
    });
    if (!created.ok) {
      return { ok: false, code: 'GITLAB_ERROR', error: created.error };
    }
    const defaultBranch = opts.input.advanced?.defaultBranch?.trim() || 'main';
    const commitMessage =
      opts.input.advanced?.commitMessage?.trim() || 'Initial commit from NextOps';
    const files = [...(opts.input.files ?? [])];
    if (opts.input.advanced?.gitignoreTemplate?.trim()) {
      files.push({
        path: '.gitignore',
        content: `# ${opts.input.advanced.gitignoreTemplate.trim()}\n`,
      });
    }
    if (files.length === 0) {
      return {
        ok: false,
        code: 'BAD_REQUEST',
        error: 'Create requires a zip or folder with at least one file',
      };
    }
    const committed = await opts.gitlab.writeFirstCommit({
      accessToken: access!.accessToken,
      projectPath: gitlabProjectPath,
      defaultBranch,
      commitMessage,
      files,
    });
    if (!committed.ok) {
      return { ok: false, code: 'GITLAB_ERROR', error: committed.error };
    }
  }

  const granted = await opts.gitlab.grantReadAccess({
    accessToken: access!.accessToken,
    projectPath: gitlabProjectPath,
    readAccessToken: readAccess.token,
  });
  if (!granted.ok) {
    return { ok: false, code: 'GITLAB_ERROR', error: granted.error };
  }

  const stored = opts.apps.registerApplication({
    name,
    gitlabProjectPath,
    registeredByUsername: account.username,
    now,
  });
  if (!stored.ok) {
    return { ok: false, code: stored.code, error: stored.error };
  }
  return { ok: true, application: stored.application };
}
