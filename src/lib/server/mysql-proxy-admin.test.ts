import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { applyMysqlProxySave } from './mysql-proxy-admin.ts';
import { openLocalSettingsStore, type LocalSettingsStore } from './local-settings-store.ts';

describe('applyMysqlProxySave', () => {
  const dirs: string[] = [];
  const stores: LocalSettingsStore[] = [];
  afterEach(() => {
    for (const s of stores.splice(0)) s.close();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('rejects bad password without calling setEnabled', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-mysql-admin-'));
    dirs.push(dataDir);
    const store = openLocalSettingsStore(path.join(dataDir, 'nextops.sqlite'));
    stores.push(store);
    await store.seedAdminIfEmpty({ username: 'admin', password: 'yes' });
    let called = false;
    const r = await applyMysqlProxySave({
      adminPassword: 'nope',
      verifyStepUp: (p) => store.verifyAdmin('admin', p),
      actor: 'admin',
      enabled: true,
      store,
      logLine: () => {},
      setEnabled: () => {
        called = true;
      },
      getEnabled: () => false,
    });
    assert.equal(r.ok, false);
    assert.equal(called, false);
  });

  it('persists when password matches', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-mysql-admin-'));
    dirs.push(dataDir);
    const store = openLocalSettingsStore(path.join(dataDir, 'nextops.sqlite'));
    stores.push(store);
    await store.seedAdminIfEmpty({ username: 'admin', password: 'yes' });
    let enabled = false;
    const r = await applyMysqlProxySave({
      adminPassword: 'yes',
      verifyStepUp: (p) => store.verifyAdmin('admin', p),
      actor: 'admin',
      enabled: true,
      store,
      logLine: () => {},
      setEnabled: (v) => {
        enabled = v;
      },
      getEnabled: () => enabled,
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.enabled, true);
  });
});
