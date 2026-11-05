import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { openLocalSettingsStore, type LocalSettingsStore } from './local-settings-store.ts';
import { attemptPasswordLogin } from './operator-auth.ts';

const dirs: string[] = [];
const stores: LocalSettingsStore[] = [];

afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

async function seededStore(): Promise<LocalSettingsStore> {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-auth-'));
  dirs.push(d);
  const store = openLocalSettingsStore(path.join(d, 'nextops.sqlite'));
  stores.push(store);
  await store.seedFirstOperatorIfEmpty({
    username: 'mc00146',
    email: 'mc00146@corp.example',
    password: 'admin123',
  });
  return store;
}

describe('attemptPasswordLogin', () => {
  it('creates a Session and a success Login Event', async () => {
    const store = await seededStore();
    const result = await attemptPasswordLogin(store, {
      username: 'mc00146',
      password: 'admin123',
      clientIp: '192.0.2.15',
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(store.getSession(result.session.id));
    assert.equal(store.listLoginEvents({ username: 'mc00146' })[0]?.outcome, 'success');
  });

  it('returns the same failure for unknown Username and wrong password', async () => {
    const store = await seededStore();
    const missing = await attemptPasswordLogin(store, {
      username: 'nosuch',
      password: 'admin123',
      clientIp: '192.0.2.15',
    });
    const wrong = await attemptPasswordLogin(store, {
      username: 'mc00146',
      password: 'nope',
      clientIp: '192.0.2.15',
    });
    assert.equal(missing.ok, false);
    assert.equal(wrong.ok, false);
    if (!missing.ok && !wrong.ok) {
      assert.equal(missing.code, 'UNAUTHORIZED');
      assert.equal(wrong.code, 'UNAUTHORIZED');
    }
  });

  it('locks after five failures even if the next password is correct', async () => {
    const store = await seededStore();
    const t0 = new Date('2026-08-01T00:00:00.000Z');
    for (let i = 0; i < 5; i++) {
      const failed = await attemptPasswordLogin(store, {
        username: 'mc00146',
        password: 'nope',
        clientIp: '192.0.2.15',
        now: new Date(t0.getTime() + i * 1000),
      });
      assert.equal(failed.ok, false);
    }
    const locked = await attemptPasswordLogin(store, {
      username: 'mc00146',
      password: 'admin123',
      clientIp: '192.0.2.15',
      now: new Date('2026-08-01T00:00:10.000Z'),
    });
    assert.equal(locked.ok, false);
    if (!locked.ok) assert.equal(locked.code, 'LOCKED');
  });

  it('requires TOTP when a Second Factor is enrolled', async () => {
    const { generateTotpSecret, totpCodeAt } = await import('./totp.ts');
    const store = await seededStore();
    const secret = generateTotpSecret();
    const now = Date.parse('2026-08-01T00:00:00.000Z');
    const enrolled = store.enrollSecondFactor({
      username: 'mc00146',
      secret,
      code: totpCodeAt(secret, now),
      now: new Date(now),
    });
    assert.equal(enrolled.ok, true);
    const without = await attemptPasswordLogin(store, {
      username: 'mc00146',
      password: 'admin123',
      clientIp: '192.0.2.15',
      now: new Date(now),
    });
    assert.equal(without.ok, false);
    const withCode = await attemptPasswordLogin(store, {
      username: 'mc00146',
      password: 'admin123',
      totpCode: totpCodeAt(secret, now),
      clientIp: '192.0.2.15',
      now: new Date(now),
    });
    assert.equal(withCode.ok, true);
  });
});
