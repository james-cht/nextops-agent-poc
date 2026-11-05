import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  openApplicationStore,
  type ApplicationStore,
} from './application-store.ts';
import { openLocalSettingsStore } from './local-settings-store.ts';

const dirs: string[] = [];
const stores: ApplicationStore[] = [];

afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-app-store-'));
  dirs.push(d);
  return d;
}

describe('Application Store', () => {
  it('persists Application name, GitLab Project path, and registering Username across reopen', () => {
    const dir = tmpDir();
    const dbPath = path.join(dir, 'applications.sqlite');
    const store = openApplicationStore(dbPath);
    stores.push(store);
    const created = store.registerApplication({
      name: '結帳',
      gitlabProjectPath: 'shop/billing-web',
      registeredByUsername: 'changsan',
    });
    assert.equal(created.ok, true);
    store.close();

    const again = openApplicationStore(dbPath);
    stores.push(again);
    const rows = again.listApplications();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, '結帳');
    assert.equal(rows[0].gitlabProjectPath, 'shop/billing-web');
    assert.equal(rows[0].registeredByUsername, 'changsan');
  });

  it('rejects duplicate Application name or GitLab Project path', () => {
    const store = openApplicationStore(path.join(tmpDir(), 'applications.sqlite'));
    stores.push(store);
    assert.equal(
      store.registerApplication({
        name: 'billing',
        gitlabProjectPath: 'shop/a',
        registeredByUsername: 'a',
      }).ok,
      true,
    );
    const dupName = store.registerApplication({
      name: 'billing',
      gitlabProjectPath: 'shop/b',
      registeredByUsername: 'a',
    });
    assert.equal(dupName.ok, false);
    if (!dupName.ok) assert.equal(dupName.code, 'CONFLICT');
    const dupPath = store.registerApplication({
      name: 'other',
      gitlabProjectPath: 'shop/a',
      registeredByUsername: 'a',
    });
    assert.equal(dupPath.ok, false);
    if (!dupPath.ok) assert.equal(dupPath.code, 'CONFLICT');
  });

  it('survives wiping the Local Settings Store file', () => {
    const dir = tmpDir();
    const appDb = path.join(dir, 'applications.sqlite');
    const settingsDb = path.join(dir, 'nextops.sqlite');
    const apps = openApplicationStore(appDb);
    stores.push(apps);
    assert.equal(
      apps.registerApplication({
        name: 'billing',
        gitlabProjectPath: 'shop/billing',
        registeredByUsername: 'owner',
      }).ok,
      true,
    );

    const settings = openLocalSettingsStore(settingsDb);
    settings.close();
    fs.rmSync(settingsDb, { force: true });

    const again = openApplicationStore(appDb);
    stores.push(again);
    assert.equal(again.listApplications().length, 1);
  });

  it('unregisters an Application so name and path may be registered again', () => {
    const store = openApplicationStore(path.join(tmpDir(), 'applications.sqlite'));
    stores.push(store);
    assert.equal(
      store.registerApplication({
        name: 'billing',
        gitlabProjectPath: 'shop/a',
        registeredByUsername: 'owner',
      }).ok,
      true,
    );
    const gone = store.unregisterApplication('billing');
    assert.equal(gone.ok, true);
    assert.equal(store.listApplications().length, 0);
    assert.equal(store.getApplicationByName('billing'), null);
    assert.equal(
      store.registerApplication({
        name: 'billing',
        gitlabProjectPath: 'shop/a',
        registeredByUsername: 'owner',
      }).ok,
      true,
    );
    const missing = store.unregisterApplication('nope');
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, 'NOT_FOUND');
  });
});
