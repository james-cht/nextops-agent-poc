import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { unregisterApplication } from './application-unregistration.ts';
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

describe('Application Unregistration', () => {
  it('lets Operator remove an Application Store row without calling GitLab', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-unreg-'));
    dirs.push(dir);
    const settings = openLocalSettingsStore(path.join(dir, 'nextops.sqlite'));
    settingsStores.push(settings);
    await settings.seedFirstOperatorIfEmpty({
      username: 'changsan',
      email: 'c@example.com',
      password: 'password-owner-12',
    });
    const apps = openApplicationStore(path.join(dir, 'applications.sqlite'));
    appStores.push(apps);
    assert.equal(
      apps.registerApplication({
        name: 'billing',
        gitlabProjectPath: 'shop/a',
        registeredByUsername: 'changsan',
      }).ok,
      true,
    );

    const result = unregisterApplication({
      operatorKey: 'changsan',
      settings,
      apps,
      name: 'billing',
    });
    assert.equal(result.ok, true);
    assert.equal(apps.listApplications().length, 0);
  });

  it('rejects Viewer and missing Applications', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-unreg-gate-'));
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
    const apps = openApplicationStore(path.join(dir, 'applications.sqlite'));
    appStores.push(apps);
    assert.equal(
      apps.registerApplication({
        name: 'billing',
        gitlabProjectPath: 'shop/a',
        registeredByUsername: 'owner',
      }).ok,
      true,
    );

    const forbidden = unregisterApplication({
      operatorKey: 'viewer1',
      settings,
      apps,
      name: 'billing',
    });
    assert.equal(forbidden.ok, false);
    if (!forbidden.ok) assert.equal(forbidden.code, 'FORBIDDEN');
    assert.equal(apps.listApplications().length, 1);

    const missing = unregisterApplication({
      operatorKey: 'owner',
      settings,
      apps,
      name: 'nope',
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, 'NOT_FOUND');
  });
});
