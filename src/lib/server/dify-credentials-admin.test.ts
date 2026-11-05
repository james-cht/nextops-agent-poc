import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  applyDifyCredentialsRestore,
  applyDifyCredentialsSave,
} from './dify-credentials-admin.ts';
import { _resetDifyCredentialsStoreForTests } from './dify-credentials.ts';
import { _resetConfigAuditForTests } from './config-audit-log.ts';
import { openLocalSettingsStore, type LocalSettingsStore } from './local-settings-store.ts';

const dirs: string[] = [];
const stores: LocalSettingsStore[] = [];

afterEach(() => {
  _resetDifyCredentialsStoreForTests();
  _resetConfigAuditForTests();
  for (const s of stores.splice(0)) s.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-dify-admin-'));
  dirs.push(d);
  return d;
}

const envCreds = {
  baseUrl: 'https://env.example/v1',
  apiKey: 'app-env-key',
  toolToken: 'tok-env',
};

describe('applyDifyCredentialsSave', () => {
  it('rejects bad admin password without writing override', async () => {
    const dataDir = tmpDir();
    const store = openLocalSettingsStore(path.join(dataDir, 'nextops.sqlite'));
    stores.push(store);
    await store.seedAdminIfEmpty({ username: 'admin', password: 'admin123' });
    const r = await applyDifyCredentialsSave({
      adminPassword: 'wrong',
      verifyStepUp: (p) => store.verifyAdmin('admin', p),
      actor: 'admin',
      patch: {
        baseUrl: 'https://good.example/v1',
        apiKey: 'app-new',
        toolToken: 'tok-new',
      },
      env: envCreds,
      store,
      dataDir,
      origin: 'http://127.0.0.1:3000',
      probeTool: async () => ({ ok: true }),
      logLine: () => {},
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'UNAUTHORIZED');
    assert.equal(store.getDifyOverride(), null);
  });

  it('rejects when tool token is missing', async () => {
    const dataDir = tmpDir();
    const store = openLocalSettingsStore(path.join(dataDir, 'nextops.sqlite'));
    stores.push(store);
    await store.seedAdminIfEmpty({ username: 'admin', password: 'admin123' });
    const r = await applyDifyCredentialsSave({
      adminPassword: 'admin123',
      verifyStepUp: (p) => store.verifyAdmin('admin', p),
      actor: 'admin',
      patch: {
        toolToken: '',
      },
      env: { ...envCreds, toolToken: '' },
      store,
      dataDir,
      origin: 'http://127.0.0.1:3000',
      probeTool: async () => ({ ok: true }),
      logLine: () => {},
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'BAD_REQUEST');
  });

  it('persists when password and tool probe pass', async () => {
    const dataDir = tmpDir();
    const store = openLocalSettingsStore(path.join(dataDir, 'nextops.sqlite'));
    stores.push(store);
    await store.seedAdminIfEmpty({ username: 'admin', password: 'admin123' });
    const r = await applyDifyCredentialsSave({
      adminPassword: 'admin123',
      verifyStepUp: (p) => store.verifyAdmin('admin', p),
      actor: 'admin',
      patch: {
        baseUrl: 'https://good.example/v1/',
        apiKey: 'app-new',
        toolToken: 'tok-new',
      },
      env: envCreds,
      store,
      dataDir,
      origin: 'http://127.0.0.1:3000',
      probeTool: async () => ({ ok: true }),
      logLine: () => {},
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.credentials.toolToken, 'tok-new');
      assert.equal(r.credentials.source, 'override');
    }
  });

  it('rolls back override when tool probe fails', async () => {
    const dataDir = tmpDir();
    const store = openLocalSettingsStore(path.join(dataDir, 'nextops.sqlite'));
    stores.push(store);
    await store.seedAdminIfEmpty({ username: 'admin', password: 'admin123' });
    const r = await applyDifyCredentialsSave({
      adminPassword: 'admin123',
      verifyStepUp: (p) => store.verifyAdmin('admin', p),
      actor: 'admin',
      patch: {
        baseUrl: 'https://good.example/v1',
        apiKey: 'app-new',
        toolToken: 'tok-new',
      },
      env: envCreds,
      store,
      dataDir,
      origin: 'http://127.0.0.1:3000',
      probeTool: async () => ({ ok: false, error: 'Tool token probe HTTP 401' }),
      logLine: () => {},
    });
    assert.equal(r.ok, false);
    assert.equal(store.getDifyOverride(), null);
  });
});

describe('applyDifyCredentialsRestore', () => {
  it('clears override after probing env values', async () => {
    const dataDir = tmpDir();
    const store = openLocalSettingsStore(path.join(dataDir, 'nextops.sqlite'));
    stores.push(store);
    await store.seedAdminIfEmpty({ username: 'admin', password: 'admin123' });
    await applyDifyCredentialsSave({
      adminPassword: 'admin123',
      verifyStepUp: (p) => store.verifyAdmin('admin', p),
      actor: 'admin',
      patch: {
        baseUrl: 'https://good.example/v1',
        apiKey: 'app-new',
        toolToken: 'tok-new',
      },
      env: envCreds,
      store,
      dataDir,
      origin: 'http://127.0.0.1:3000',
      probeTool: async () => ({ ok: true }),
      logLine: () => {},
    });
    const r = await applyDifyCredentialsRestore({
      adminPassword: 'admin123',
      verifyStepUp: (p) => store.verifyAdmin('admin', p),
      actor: 'admin',
      env: envCreds,
      store,
      dataDir,
      origin: 'http://127.0.0.1:3000',
      probeTool: async () => ({ ok: true }),
      logLine: () => {},
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.credentials.source, 'env');
  });
});
