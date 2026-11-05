import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { verifyStepUpAgainstStore } from './step-up-password.ts';
import { applyMysqlProxySave } from './mysql-proxy-admin.ts';
import { openLocalSettingsStore, type LocalSettingsStore } from './local-settings-store.ts';

/**
 * Feedback loop for SRE Runtime Setting step-up failures after Operator Accounts.
 * Symptom: user enters the password that logs them in; modal still shows failure.
 */
describe('Runtime Setting step-up vs Operator Lasting Password', () => {
  const dirs: string[] = [];
  const stores: LocalSettingsStore[] = [];
  afterEach(() => {
    for (const s of stores.splice(0)) s.close();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('accepts Platform Owner lasting password after it diverges from leftover admin_credential', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-stepup-'));
    dirs.push(dataDir);
    const store = openLocalSettingsStore(path.join(dataDir, 'nextops.sqlite'));
    stores.push(store);

    await store.seedAdminIfEmpty({ username: 'admin', password: 'seed-pass-12' });
    const changed = await store.changeOwnLastingPassword({
      username: 'admin',
      currentPassword: 'seed-pass-12',
      newPassword: 'lasting-pass-99',
    });
    assert.equal(changed.ok, true);

    assert.equal(await store.verifyOperatorPassword('admin', 'lasting-pass-99'), true);
    assert.equal(await store.verifyAdmin('admin', 'lasting-pass-99'), false);
    assert.equal(await store.verifyAdmin('admin', 'seed-pass-12'), true);

    assert.equal(await verifyStepUpAgainstStore(store, 'lasting-pass-99'), true);
    assert.equal(await verifyStepUpAgainstStore(store, 'seed-pass-12'), true);
    assert.equal(await verifyStepUpAgainstStore(store, 'wrong'), false);

    let enabled = false;
    const saved = await applyMysqlProxySave({
      adminPassword: 'lasting-pass-99',
      verifyStepUp: (p) => verifyStepUpAgainstStore(store, p),
      actor: 'admin',
      enabled: true,
      store,
      logLine: () => {},
      setEnabled: (v) => {
        enabled = v;
      },
      getEnabled: () => enabled,
    });
    assert.equal(saved.ok, true);
    assert.equal(enabled, true);
  });

  it('rejects non-owner Operator lasting password for step-up', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-stepup-'));
    dirs.push(dataDir);
    const store = openLocalSettingsStore(path.join(dataDir, 'nextops.sqlite'));
    stores.push(store);

    await store.seedAdminIfEmpty({ username: 'admin', password: 'seed-pass-12' });
    const created = await store.createOperatorAccount({
      actorUsername: 'admin',
      username: 'viewer1',
      email: 'viewer1@corp.example',
      displayName: 'Viewer One',
      role: 'viewer',
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const setLasting = await store.changeOwnLastingPassword({
      username: 'viewer1',
      currentPassword: created.temporaryPassword,
      newPassword: 'viewer-lasting-1',
    });
    assert.equal(setLasting.ok, true);

    assert.equal(await verifyStepUpAgainstStore(store, 'viewer-lasting-1'), false);
  });
});
