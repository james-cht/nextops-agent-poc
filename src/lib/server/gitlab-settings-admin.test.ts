import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  applyGitLabOAuthClientSave,
  applyGitLabReadAccessSave,
} from './gitlab-settings-admin.ts';
import { openLocalSettingsStore, type LocalSettingsStore } from './local-settings-store.ts';

describe('GitLab Runtime Setting admin apply', () => {
  const dirs: string[] = [];
  const stores: LocalSettingsStore[] = [];
  afterEach(() => {
    for (const s of stores.splice(0)) s.close();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function openStore() {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-gitlab-admin-'));
    dirs.push(dataDir);
    const store = openLocalSettingsStore(path.join(dataDir, 'nextops.sqlite'));
    stores.push(store);
    return store;
  }

  it('rejects bad step-up without persisting GitLab OAuth Client', async () => {
    const store = openStore();
    await store.seedAdminIfEmpty({ username: 'admin', password: 'yes' });
    const r = await applyGitLabOAuthClientSave({
      adminPassword: 'nope',
      verifyStepUp: (p) => store.verifyAdmin('admin', p),
      actor: 'admin',
      store,
      patch: {
        baseUrl: 'https://gitlab.example',
        clientId: 'cid',
        clientSecret: 'sec',
      },
      probeOAuthClient: async () => ({ ok: true }),
      logLine: () => {},
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'UNAUTHORIZED');
    assert.equal(store.getGitLabOAuthClient(), null);
  });

  it('persists GitLab OAuth Client when step-up and probe pass', async () => {
    const store = openStore();
    await store.seedAdminIfEmpty({ username: 'admin', password: 'yes' });
    const r = await applyGitLabOAuthClientSave({
      adminPassword: 'yes',
      verifyStepUp: (p) => store.verifyAdmin('admin', p),
      actor: 'admin',
      store,
      patch: {
        baseUrl: 'https://gitlab.example',
        clientId: 'cid',
        clientSecret: 'sec',
      },
      probeOAuthClient: async () => ({ ok: true }),
      logLine: () => {},
    });
    assert.equal(r.ok, true);
    assert.deepEqual(store.getGitLabOAuthClient(), {
      baseUrl: 'https://gitlab.example',
      clientId: 'cid',
      clientSecret: 'sec',
    });
  });

  it('rolls back and rejects when GitLab Read Access probe fails', async () => {
    const store = openStore();
    await store.seedAdminIfEmpty({ username: 'admin', password: 'yes' });
    store.setGitLabOAuthClient({
      baseUrl: 'https://gitlab.example',
      clientId: 'cid',
      clientSecret: 'sec',
    });
    store.setGitLabReadAccess({ token: 'glpat-old' });
    const r = await applyGitLabReadAccessSave({
      adminPassword: 'yes',
      verifyStepUp: (p) => store.verifyAdmin('admin', p),
      actor: 'admin',
      store,
      patch: { token: 'glpat-new' },
      probeReadAccess: async () => ({ ok: false, error: 'GitLab Read Access probe HTTP 401' }),
      logLine: () => {},
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'TEST_FAILED');
    assert.deepEqual(store.getGitLabReadAccess(), { token: 'glpat-old' });
  });
});
