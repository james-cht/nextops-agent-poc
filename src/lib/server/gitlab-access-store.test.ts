import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { openLocalSettingsStore, type LocalSettingsStore } from './local-settings-store.ts';

const dirs: string[] = [];
const stores: LocalSettingsStore[] = [];

afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('Local Settings Store — GitLab Access', () => {
  it('binds GitLab Access to an Operator Account and clears it on disable', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-gl-access-'));
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
      username: 'changsan',
      email: 'c@example.com',
      displayName: 'Test Person',
      role: 'operator',
    });
    assert.equal(created.ok, true);

    store.setGitLabAccess({
      username: 'changsan',
      accessToken: 'tok',
      refreshToken: 'ref',
      expiresAt: '2026-06-01T00:00:00.000Z',
    });
    assert.equal(store.getGitLabAccess('changsan')?.accessToken, 'tok');
    assert.equal(store.getGitLabAccess('owner'), null);

    const disabled = store.disableOperatorAccount({
      actorUsername: 'owner',
      username: 'changsan',
    });
    assert.equal(disabled.ok, true);
    assert.equal(store.getGitLabAccess('changsan'), null);
  });
});
