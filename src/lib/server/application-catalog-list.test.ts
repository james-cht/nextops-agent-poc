import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { listApplicationCatalog } from './application-catalog-list.ts';
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

describe('Application Catalog list', () => {
  it('rejects unauthenticated requests and returns catalog rows for a Session', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-catalog-list-'));
    dirs.push(dir);
    const settings = openLocalSettingsStore(path.join(dir, 'nextops.sqlite'));
    settingsStores.push(settings);
    await settings.seedFirstOperatorIfEmpty({
      username: 'owner',
      email: 'owner@example.com',
      password: 'password-owner-12',
    });
    const apps = openApplicationStore(path.join(dir, 'applications.sqlite'));
    appStores.push(apps);
    assert.equal(
      apps.registerApplication({
        name: '結帳',
        gitlabProjectPath: 'shop/billing',
        registeredByUsername: 'owner',
      }).ok,
      true,
    );

    const denied = listApplicationCatalog({
      operatorKey: null,
      settings,
      apps,
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, 'UNAUTHORIZED');

    const ok = listApplicationCatalog({
      operatorKey: 'owner',
      settings,
      apps,
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.applications.length, 1);
      assert.equal(ok.applications[0].name, '結帳');
      assert.equal(ok.applications[0].gitlabProjectPath, 'shop/billing');
    }
  });
});
