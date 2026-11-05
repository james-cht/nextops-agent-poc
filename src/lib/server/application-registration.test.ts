import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  registerApplication,
  type GitLabRegistrationPort,
} from './application-registration.ts';
import { openApplicationStore, type ApplicationStore } from './application-store.ts';
import { openLocalSettingsStore, type LocalSettingsStore } from './local-settings-store.ts';

const dirs: string[] = [];
const appStores: ApplicationStore[] = [];
const settingsStores: LocalSettingsStore[] = [];

afterEach(() => {
  for (const s of appStores.splice(0)) s.close();
  for (const s of settingsStores.splice(0)) s.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function fakePort(opts?: {
  attachOk?: boolean;
  grantOk?: boolean;
}): GitLabRegistrationPort & {
  calls: string[];
  lastCreate: null | {
    projectPath: string;
    visibility?: string;
    defaultBranch?: string;
    description?: string;
  };
  lastCommit: null | {
    projectPath: string;
    defaultBranch: string;
    commitMessage: string;
    files: Array<{ path: string; content: string }>;
  };
} {
  const calls: string[] = [];
  return {
    calls,
    lastCreate: null,
    lastCommit: null,
    async proveCanAttach({ projectPath }) {
      calls.push(`prove:${projectPath}`);
      if (opts?.attachOk === false) return { ok: false, error: 'no access' };
      return { ok: true };
    },
    async grantReadAccess({ projectPath }) {
      calls.push(`grant:${projectPath}`);
      if (opts?.grantOk === false) return { ok: false, error: 'grant failed' };
      return { ok: true };
    },
    async createProject(args) {
      calls.push('create');
      this.lastCreate = {
        projectPath: args.projectPath,
        visibility: args.visibility,
        defaultBranch: args.defaultBranch,
        description: args.description,
      };
      return { ok: true };
    },
    async writeFirstCommit(args) {
      calls.push('commit');
      this.lastCommit = {
        projectPath: args.projectPath,
        defaultBranch: args.defaultBranch,
        commitMessage: args.commitMessage,
        files: args.files,
      };
      return { ok: true };
    },
  };
}

describe('Application Registration — attach', () => {
  it('attaches an existing GitLab Project and records registering Username', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-reg-attach-'));
    dirs.push(dir);
    const settings = openLocalSettingsStore(path.join(dir, 'nextops.sqlite'));
    settingsStores.push(settings);
    await settings.seedFirstOperatorIfEmpty({
      username: 'changsan',
      email: 'c@example.com',
      password: 'password-owner-12',
    });
    settings.setGitLabOAuthClient({
      baseUrl: 'https://gitlab.example',
      clientId: 'cid',
      clientSecret: 'sec',
    });
    settings.setGitLabReadAccess({ token: 'read-tok' });
    settings.setGitLabAccess({
      username: 'changsan',
      accessToken: 'op-tok',
      refreshToken: null,
      expiresAt: '2026-06-01T00:00:00.000Z',
    });
    const apps = openApplicationStore(path.join(dir, 'applications.sqlite'));
    appStores.push(apps);
    const gitlab = fakePort();

    const result = await registerApplication({
      operatorKey: 'changsan',
      settings,
      apps,
      gitlab,
      now: new Date('2026-01-01T00:00:00Z'),
      input: {
        mode: 'attach',
        name: '結帳',
        gitlabProjectPath: 'shop/billing-web',
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.application.name, '結帳');
      assert.equal(result.application.gitlabProjectPath, 'shop/billing-web');
      assert.equal(result.application.registeredByUsername, 'changsan');
    }
    assert.deepEqual(gitlab.calls, ['prove:shop/billing-web', 'grant:shop/billing-web']);
    assert.equal(apps.listApplications().length, 1);
  });

  it('re-challenges GitLab when Access is missing without writing an Application', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-reg-reauth-'));
    dirs.push(dir);
    const settings = openLocalSettingsStore(path.join(dir, 'nextops.sqlite'));
    settingsStores.push(settings);
    await settings.seedFirstOperatorIfEmpty({
      username: 'changsan',
      email: 'c@example.com',
      password: 'password-owner-12',
    });
    settings.setGitLabOAuthClient({
      baseUrl: 'https://gitlab.example',
      clientId: 'cid',
      clientSecret: 'sec',
    });
    settings.setGitLabReadAccess({ token: 'read-tok' });
    const apps = openApplicationStore(path.join(dir, 'applications.sqlite'));
    appStores.push(apps);
    const gitlab = fakePort();

    const result = await registerApplication({
      operatorKey: 'changsan',
      settings,
      apps,
      gitlab,
      now: new Date('2026-01-01T00:00:00Z'),
      input: { mode: 'attach', name: 'billing', gitlabProjectPath: 'shop/a' },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'GITLAB_REAUTH');
    assert.equal(apps.listApplications().length, 0);
    assert.deepEqual(gitlab.calls, []);
    assert.equal(settings.countSessions({ username: 'changsan' }), 0);
  });

  it('leaves no Application row when GitLab Read Access grant fails', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-reg-grant-'));
    dirs.push(dir);
    const settings = openLocalSettingsStore(path.join(dir, 'nextops.sqlite'));
    settingsStores.push(settings);
    await settings.seedFirstOperatorIfEmpty({
      username: 'changsan',
      email: 'c@example.com',
      password: 'password-owner-12',
    });
    settings.setGitLabOAuthClient({
      baseUrl: 'https://gitlab.example',
      clientId: 'cid',
      clientSecret: 'sec',
    });
    settings.setGitLabReadAccess({ token: 'read-tok' });
    settings.setGitLabAccess({
      username: 'changsan',
      accessToken: 'op-tok',
      expiresAt: null,
    });
    const apps = openApplicationStore(path.join(dir, 'applications.sqlite'));
    appStores.push(apps);
    const gitlab = fakePort({ grantOk: false });

    const result = await registerApplication({
      operatorKey: 'changsan',
      settings,
      apps,
      gitlab,
      input: { mode: 'attach', name: 'billing', gitlabProjectPath: 'shop/a' },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'GITLAB_ERROR');
    assert.equal(apps.listApplications().length, 0);
  });

  it('rejects Viewer and duplicate name or path', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-reg-gate-'));
    dirs.push(dir);
    const settings = openLocalSettingsStore(path.join(dir, 'nextops.sqlite'));
    settingsStores.push(settings);
    await settings.seedFirstOperatorIfEmpty({
      username: 'owner',
      email: 'owner@example.com',
      password: 'password-owner-12',
    });
    const created = await settings.createOperatorAccount({
      actorUsername: 'owner',
      username: 'viewer1',
      email: 'v@example.com',
      displayName: 'Test Person',
      role: 'viewer',
    });
    assert.equal(created.ok, true);
    settings.setGitLabOAuthClient({
      baseUrl: 'https://gitlab.example',
      clientId: 'cid',
      clientSecret: 'sec',
    });
    settings.setGitLabReadAccess({ token: 'read-tok' });
    settings.setGitLabAccess({ username: 'owner', accessToken: 'op-tok', expiresAt: null });
    settings.setGitLabAccess({ username: 'viewer1', accessToken: 'v-tok', expiresAt: null });
    const apps = openApplicationStore(path.join(dir, 'applications.sqlite'));
    appStores.push(apps);
    const gitlab = fakePort();

    const forbidden = await registerApplication({
      operatorKey: 'viewer1',
      settings,
      apps,
      gitlab,
      input: { mode: 'attach', name: 'x', gitlabProjectPath: 'shop/x' },
    });
    assert.equal(forbidden.ok, false);
    if (!forbidden.ok) assert.equal(forbidden.code, 'FORBIDDEN');

    assert.equal(
      (
        await registerApplication({
          operatorKey: 'owner',
          settings,
          apps,
          gitlab,
          input: { mode: 'attach', name: 'billing', gitlabProjectPath: 'shop/a' },
        })
      ).ok,
      true,
    );
    const dup = await registerApplication({
      operatorKey: 'owner',
      settings,
      apps,
      gitlab,
      input: { mode: 'attach', name: 'billing', gitlabProjectPath: 'shop/b' },
    });
    assert.equal(dup.ok, false);
    if (!dup.ok) assert.equal(dup.code, 'CONFLICT');
    assert.equal(apps.listApplications().length, 1);
  });
});

describe('Application Registration — create', () => {
  it('creates a GitLab Project, writes one first commit, and applies 進階 fields', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-reg-create-'));
    dirs.push(dir);
    const settings = openLocalSettingsStore(path.join(dir, 'nextops.sqlite'));
    settingsStores.push(settings);
    await settings.seedFirstOperatorIfEmpty({
      username: 'changsan',
      email: 'c@example.com',
      password: 'password-owner-12',
    });
    settings.setGitLabOAuthClient({
      baseUrl: 'https://gitlab.example',
      clientId: 'cid',
      clientSecret: 'sec',
    });
    settings.setGitLabReadAccess({ token: 'read-tok' });
    settings.setGitLabAccess({
      username: 'changsan',
      accessToken: 'op-tok',
      expiresAt: null,
    });
    const apps = openApplicationStore(path.join(dir, 'applications.sqlite'));
    appStores.push(apps);
    const gitlab = fakePort();

    const result = await registerApplication({
      operatorKey: 'changsan',
      settings,
      apps,
      gitlab,
      input: {
        mode: 'create',
        name: '結帳',
        gitlabProjectPath: 'shop/billing-new',
        files: [{ path: 'README.md', content: '# billing\n' }],
        advanced: {
          visibility: 'private',
          defaultBranch: 'develop',
          description: 'checkout app',
          gitignoreTemplate: 'Node',
          commitMessage: 'chore: bootstrap',
        },
      },
    });

    assert.equal(result.ok, true);
    assert.ok(gitlab.calls.includes('create'));
    assert.ok(gitlab.calls.includes('commit'));
    assert.ok(gitlab.calls.includes('grant:shop/billing-new'));
    assert.ok(!gitlab.calls.some((c) => c.startsWith('prove:')));
    assert.equal(gitlab.lastCreate?.visibility, 'private');
    assert.equal(gitlab.lastCreate?.defaultBranch, 'develop');
    assert.equal(gitlab.lastCreate?.description, 'checkout app');
    assert.equal(gitlab.lastCommit?.defaultBranch, 'develop');
    assert.equal(gitlab.lastCommit?.commitMessage, 'chore: bootstrap');
    assert.ok(gitlab.lastCommit?.files.some((f) => f.path === 'README.md'));
    assert.ok(gitlab.lastCommit?.files.some((f) => f.path === '.gitignore'));
    assert.equal(apps.listApplications().length, 1);
    assert.equal(apps.listApplications()[0].name, '結帳');
  });

  it('does not write source on attach and still rejects empty create', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-reg-modes-'));
    dirs.push(dir);
    const settings = openLocalSettingsStore(path.join(dir, 'nextops.sqlite'));
    settingsStores.push(settings);
    await settings.seedFirstOperatorIfEmpty({
      username: 'changsan',
      email: 'c@example.com',
      password: 'password-owner-12',
    });
    settings.setGitLabOAuthClient({
      baseUrl: 'https://gitlab.example',
      clientId: 'cid',
      clientSecret: 'sec',
    });
    settings.setGitLabReadAccess({ token: 'read-tok' });
    settings.setGitLabAccess({
      username: 'changsan',
      accessToken: 'op-tok',
      expiresAt: null,
    });
    const apps = openApplicationStore(path.join(dir, 'applications.sqlite'));
    appStores.push(apps);
    const gitlab = fakePort();

    assert.equal(
      (
        await registerApplication({
          operatorKey: 'changsan',
          settings,
          apps,
          gitlab,
          input: { mode: 'attach', name: 'a', gitlabProjectPath: 'shop/a' },
        })
      ).ok,
      true,
    );
    assert.ok(!gitlab.calls.includes('create'));
    assert.ok(!gitlab.calls.includes('commit'));

    const empty = await registerApplication({
      operatorKey: 'changsan',
      settings,
      apps,
      gitlab,
      input: { mode: 'create', name: 'b', gitlabProjectPath: 'shop/b', files: [] },
    });
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.code, 'BAD_REQUEST');
  });
});
