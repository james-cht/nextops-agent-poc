import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  completeGitLabOAuthCallback,
  gitlabAccessStatus,
  startGitLabOAuth,
} from './gitlab-oauth-flow.ts';
import { openLocalSettingsStore, type LocalSettingsStore } from './local-settings-store.ts';

const dirs: string[] = [];
const stores: LocalSettingsStore[] = [];

afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('GitLab OAuth flow', () => {
  it('persists GitLab Access on callback without creating a Session', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-gl-oauth-'));
    dirs.push(d);
    const store = openLocalSettingsStore(path.join(d, 'nextops.sqlite'));
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'changsan',
      email: 'c@example.com',
      password: 'password-owner-12',
    });
    store.setGitLabOAuthClient({
      baseUrl: 'https://gitlab.example',
      clientId: 'cid',
      clientSecret: 'sec',
    });

    const started = startGitLabOAuth({
      operatorKey: 'changsan',
      settings: store,
      publicOrigin: 'https://nextops.example',
      state: 'state-1',
      now: new Date('2026-01-01T00:00:00Z'),
    });
    assert.equal(started.ok, true);
    if (started.ok) {
      assert.match(started.authorizeUrl, /\/oauth\/authorize/);
      assert.match(started.authorizeUrl, /state=state-1/);
    }

    assert.equal(store.countSessions({ username: 'changsan' }), 0);

    const completed = await completeGitLabOAuthCallback({
      code: 'the-code',
      state: 'state-1',
      settings: store,
      publicOrigin: 'https://nextops.example',
      now: new Date('2026-01-01T00:00:00Z'),
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            access_token: 'tok',
            refresh_token: 'ref',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    });
    assert.equal(completed.ok, true);
    assert.equal(store.getGitLabAccess('changsan')?.accessToken, 'tok');
    assert.equal(store.countSessions({ username: 'changsan' }), 0);
    const status = gitlabAccessStatus(store.getGitLabAccess('changsan'), new Date('2026-01-01T00:30:00Z'));
    assert.equal(status.connected, true);
    assert.equal(status.valid, true);
  });

  it('forbids Viewer from starting OAuth', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-gl-oauth-v-'));
    dirs.push(d);
    const store = openLocalSettingsStore(path.join(d, 'nextops.sqlite'));
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'owner',
      email: 'owner@example.com',
      password: 'password-owner-12',
    });
    const created = await store.createOperatorAccount({
      actorUsername: 'owner',
      username: 'viewer1',
      email: 'v@example.com',
      displayName: 'Test Person',
      role: 'viewer',
    });
    assert.equal(created.ok, true);
    store.setGitLabOAuthClient({
      baseUrl: 'https://gitlab.example',
      clientId: 'cid',
      clientSecret: 'sec',
    });
    const started = startGitLabOAuth({
      operatorKey: 'viewer1',
      settings: store,
      publicOrigin: 'https://nextops.example',
    });
    assert.equal(started.ok, false);
    if (!started.ok) assert.equal(started.code, 'FORBIDDEN');
  });

  it('registers GitLab OAuth redirect under Public Base Path', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-gl-oauth-base-'));
    dirs.push(d);
    const store = openLocalSettingsStore(path.join(d, 'nextops.sqlite'));
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'changsan',
      email: 'c@example.com',
      password: 'password-owner-12',
    });
    store.setGitLabOAuthClient({
      baseUrl: 'https://gitlab.example',
      clientId: 'cid',
      clientSecret: 'sec',
    });
    const started = startGitLabOAuth({
      operatorKey: 'changsan',
      settings: store,
      publicOrigin: 'https://tmdev.corp.example.com',
      publicBasePath: '/nextops',
      state: 'state-base',
    });
    assert.equal(started.ok, true);
    if (started.ok) {
      const href = new URL(started.authorizeUrl);
      assert.equal(
        href.searchParams.get('redirect_uri'),
        'https://tmdev.corp.example.com/nextops/api/auth/gitlab/callback',
      );
    }
  });
});
