import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  openLocalSettingsStore,
  type LocalSettingsStore,
} from './local-settings-store.ts';

const dirs: string[] = [];
const stores: LocalSettingsStore[] = [];

afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmpDb(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-lss-'));
  dirs.push(d);
  return path.join(d, 'nextops.sqlite');
}

describe('Local Settings Store — Admin Credential', () => {
  it('seeds from env once and verifies login', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    const seeded = await store.seedAdminIfEmpty({ username: 'admin', password: 'admin123' });
    assert.equal(seeded, true);
    assert.equal(await store.verifyAdmin('admin', 'admin123'), true);
    assert.equal(await store.verifyAdmin('admin', 'wrong'), false);
    const again = await store.seedAdminIfEmpty({ username: 'other', password: 'x' });
    assert.equal(again, false);
    assert.equal(await store.verifyAdmin('other', 'x'), false);
    assert.equal(await store.verifyAdmin('admin', 'admin123'), true);
  });

  it('changes username and password after current password check', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedAdminIfEmpty({ username: 'admin', password: 'oldpass' });
    const bad = await store.changeAdmin({
      currentPassword: 'nope',
      newUsername: 'ops',
      newPassword: 'newpass',
    });
    assert.equal(bad.ok, false);
    const ok = await store.changeAdmin({
      currentPassword: 'oldpass',
      newUsername: 'ops',
      newPassword: 'newpass',
    });
    assert.equal(ok.ok, true);
    assert.equal(await store.verifyAdmin('admin', 'oldpass'), false);
    assert.equal(await store.verifyAdmin('ops', 'newpass'), true);
  });
});

describe('Local Settings Store — Runtime + legacy import', () => {
  it('stores and clears Dify override', () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    assert.equal(store.getDifyOverride(), null);
    store.setDifyOverride({
      baseUrl: 'https://dify.example/v1',
      apiKey: 'app-x',
      toolToken: 'tok-x',
    });
    assert.equal(store.getDifyOverride()?.apiKey, 'app-x');
    store.clearDifyOverride();
    assert.equal(store.getDifyOverride(), null);
  });

  it('imports legacy JSON files once', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-legacy-'));
    dirs.push(d);
    fs.writeFileSync(
      path.join(d, 'dify-credentials.json'),
      JSON.stringify({
        baseUrl: 'https://legacy.example/v1',
        apiKey: 'app-leg',
        toolToken: 'tok-leg',
      }),
    );
    fs.writeFileSync(path.join(d, 'mysql-proxy.json'), JSON.stringify({ enabled: true }));
    fs.writeFileSync(
      path.join(d, 'config-audit.jsonl'),
      `${JSON.stringify({
        ts: '2026-01-01T00:00:00.000Z',
        action: 'save',
        setting: 'mysql_proxy',
        outcome: 'saved',
        actor: 'admin',
      })}\n`,
    );

    const dbPath = path.join(d, 'nextops.sqlite');
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    assert.equal(store.importLegacyDataDir(d), true);
    assert.equal(store.getDifyOverride()?.baseUrl, 'https://legacy.example/v1');
    assert.equal(store.getMysqlProxyEnabled(), true);
    assert.equal(store.listAudit(10).length, 1);
    assert.equal(store.importLegacyDataDir(d), false);
    assert.ok(fs.existsSync(path.join(d, 'dify-credentials.json.migrated')));
  });

  it('turns MySQL CONNECT preference off (Production deploy apply)', () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    store.setMysqlProxyEnabled(true);
    assert.equal(store.getMysqlProxyEnabled(), true);
    store.setMysqlProxyEnabled(false);
    assert.equal(store.getMysqlProxyEnabled(), false);
  });

  it('stores Model Rate Table as a Runtime Setting', () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    assert.equal(store.getModelRateTable(), null);
    store.setModelRateTable({
      'gemini-2.5-flash-lite': { inputUsdPerMillion: 0.2, outputUsdPerMillion: 0.8 },
    });
    assert.equal(store.getModelRateTable()?.['gemini-2.5-flash-lite']?.inputUsdPerMillion, 0.2);
  });
});

describe('Local Settings Store — Smart Logging prefs', () => {
  it('seeds categories when missing and persists watchlist', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    const first = store.getSmartLoggingPrefs('alice', 'lh');
    assert.equal(first.seeded, true);
    assert.equal(first.watchlist.length, 0);
    assert.equal(first.categories.length, 4);

    store.putSmartLoggingPrefs('alice', 'lh', {
      watchlist: ['logs-lh-k8s-es-log-*'],
      activeIndex: 'logs-lh-k8s-es-log-*',
      categories: first.categories,
    });
    const second = store.getSmartLoggingPrefs('alice', 'lh');
    assert.equal(second.seeded, false);
    assert.deepEqual(second.watchlist, ['logs-lh-k8s-es-log-*']);
    assert.equal(second.activeIndex, 'logs-lh-k8s-es-log-*');
  });
});

describe('Local Settings Store — Release Notes Last-Read', () => {
  it('persists Last-Read per Operator Account and ignores an invalid Version', () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    assert.equal(store.getReleaseNotesLastRead('alice'), null);
    store.putReleaseNotesLastRead('alice', '1.0.0');
    assert.equal(store.getReleaseNotesLastRead('alice'), '1.0.0');
    assert.equal(store.getReleaseNotesLastRead('bob'), null);
    store.putReleaseNotesLastRead('alice', 'not-a-version');
    assert.equal(store.getReleaseNotesLastRead('alice'), '1.0.0');
    store.close();
    stores.pop();
    const reopened = openLocalSettingsStore(dbPath);
    stores.push(reopened);
    assert.equal(reopened.getReleaseNotesLastRead('alice'), '1.0.0');
  });
});

describe('Local Settings Store — Operator Account', () => {
  it('seeds the first Operator Account as Platform Owner once', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    const seeded = await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    assert.equal(seeded, true);
    const account = store.getOperatorAccount('mc00146');
    assert.equal(account?.username, 'mc00146');
    assert.equal(account?.email, 'mc00146@corp.example');
    assert.equal(account?.role, 'platform_owner');
    assert.equal(account?.disabled, false);
    assert.equal(await store.verifyOperatorPassword('mc00146', 'admin123'), true);
    assert.equal(await store.verifyOperatorPassword('mc00146', 'wrong'), false);
    const again = await store.seedFirstOperatorIfEmpty({
      username: 'other',
      email: 'other@corp.example',
      password: 'otherpass',
    });
    assert.equal(again, false);
    assert.equal(store.getOperatorAccount('other'), null);
    assert.equal(await store.verifyOperatorPassword('other', 'otherpass'), false);
  });

  it('promotes seedAdminIfEmpty into the first Operator Account', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedAdminIfEmpty({ username: 'admin', password: 'admin123' });
    const account = store.getOperatorAccount('admin');
    assert.equal(account?.role, 'platform_owner');
    assert.equal(account?.email, 'admin@localhost');
    assert.equal(await store.verifyOperatorPassword('admin', 'admin123'), true);
    assert.equal(await store.verifyAdmin('admin', 'admin123'), true);
  });

  it('issues a Session that survives process reopen', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    const session = store.createSession({
      username: 'mc00146',
      clientIp: '192.0.2.15',
      userAgent: 'vitest',
    });
    assert.ok(session.id.length >= 16);
    assert.notEqual(session.id, 'authenticated');
    assert.equal(session.username, 'mc00146');
    assert.equal(session.clientIp, '192.0.2.15');
    store.close();
    const reopened = openLocalSettingsStore(dbPath);
    stores.push(reopened);
    const loaded = reopened.getSession(session.id);
    assert.equal(loaded?.username, 'mc00146');
    assert.equal(loaded?.clientIp, '192.0.2.15');
  });

  it('expires a Session after 8h idle or 24h absolute', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    const t0 = new Date('2026-08-01T00:00:00.000Z');
    const idle = store.createSession({
      username: 'mc00146',
      clientIp: '192.0.2.15',
      now: t0,
    });
    assert.ok(store.getSession(idle.id, t0));
    assert.equal(store.getSession(idle.id, new Date('2026-08-01T08:00:01.000Z')), null);

    const abs = store.createSession({
      username: 'mc00146',
      clientIp: '192.0.2.15',
      now: t0,
    });
    store.touchSession(abs.id, new Date('2026-08-01T23:00:00.000Z'));
    assert.ok(store.getSession(abs.id, new Date('2026-08-01T23:00:00.000Z')));
    assert.equal(store.getSession(abs.id, new Date('2026-08-02T00:00:01.000Z')), null);
  });

  it('records Login Events and locks after five failures in 15 minutes', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    const t0 = new Date('2026-08-01T00:00:00.000Z');
    for (let i = 0; i < 5; i++) {
      store.appendLoginEvent({
        username: 'mc00146',
        outcome: 'failure',
        clientIp: '192.0.2.15',
        at: new Date(t0.getTime() + i * 1000),
      });
    }
    assert.equal(store.isLoginLocked('mc00146', new Date('2026-08-01T00:00:10.000Z')), true);
    assert.equal(store.isLoginLocked('mc00146', new Date('2026-08-01T00:15:11.000Z')), false);
    const mine = store.listLoginEvents({ username: 'mc00146' });
    assert.equal(mine.length, 5);
    assert.equal(store.listLoginEvents({ username: 'other' }).length, 0);
  });

  it('revokes a Session', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    const session = store.createSession({
      username: 'mc00146',
      clientIp: '192.0.2.15',
    });
    store.revokeSession(session.id);
    assert.equal(store.getSession(session.id), null);
  });

  it('counts active Sessions per Operator Account and fleet-wide', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    store.createSession({ username: 'mc00146', clientIp: '192.0.2.15' });
    store.createSession({ username: 'mc00146', clientIp: '192.0.2.16' });
    assert.equal(store.countSessions({ username: 'mc00146' }), 2);
    assert.equal(store.countSessions(), 2);
  });

  it('creates an Operator Account with a Temporary Password shown once', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    const created = await store.createOperatorAccount({
      actorUsername: 'mc00146',
      username: 'intern',
      email: 'intern@corp.example',
      displayName: 'Test Person',
      role: 'viewer',
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.ok(created.temporaryPassword.length >= 12);
    assert.equal(store.getOperatorAccount('intern')?.role, 'viewer');
    assert.equal(store.getOperatorAccount('intern')?.email, 'intern@corp.example');
    assert.equal(await store.verifyOperatorPassword('intern', created.temporaryPassword), true);
    const dup = await store.createOperatorAccount({
      actorUsername: 'mc00146',
      username: 'intern',
      email: 'other@corp.example',
      displayName: 'Test Person',
      role: 'operator',
    });
    assert.equal(dup.ok, false);
  });

  it('stores Operator Display Name on create and refuses to clear it once set', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    assert.equal(store.getOperatorAccount('mc00146')?.displayName, null);

    const created = await store.createOperatorAccount({
      actorUsername: 'mc00146',
      username: 'intern',
      email: 'intern@corp.example',
      displayName: '  實習生  ',
      role: 'viewer',
    });
    assert.equal(created.ok, true);
    assert.equal(store.getOperatorAccount('intern')?.displayName, '實習生');

    const cleared = store.updateOperatorAccount({
      actorUsername: 'mc00146',
      username: 'intern',
      displayName: '   ',
    });
    assert.equal(cleared.ok, false);
    assert.equal(store.getOperatorAccount('intern')?.displayName, '實習生');

    const renamed = store.updateOperatorAccount({
      actorUsername: 'mc00146',
      username: 'intern',
      displayName: '王小明',
    });
    assert.equal(renamed.ok, true);
    assert.equal(store.getOperatorAccount('intern')?.displayName, '王小明');

    const fillSeed = store.updateOperatorAccount({
      actorUsername: 'mc00146',
      username: 'mc00146',
      displayName: '平台負責人',
    });
    assert.equal(fillSeed.ok, true);
    assert.equal(store.getOperatorAccount('mc00146')?.displayName, '平台負責人');
  });

  it('creates an Application Developer Operator Account', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    const created = await store.createOperatorAccount({
      actorUsername: 'mc00146',
      username: 'lin.dev',
      email: 'lin.dev@corp.example',
      displayName: 'Test Person',
      role: 'application_developer',
    });
    assert.equal(created.ok, true);
    assert.equal(store.getOperatorAccount('lin.dev')?.role, 'application_developer');
  });

  it('rejects Username OPSGPT case-insensitively', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    const created = await store.createOperatorAccount({
      actorUsername: 'mc00146',
      username: 'Opsgpt',
      email: 'bot@corp.example',
      displayName: 'Test Person',
      role: 'operator',
    });
    assert.equal(created.ok, false);
    if (created.ok) return;
    assert.equal(created.code, 'BAD_REQUEST');
  });

  it('refuses to disable the last Platform Owner', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    const result = store.disableOperatorAccount({
      actorUsername: 'mc00146',
      username: 'mc00146',
    });
    assert.equal(result.ok, false);
    assert.equal(store.getOperatorAccount('mc00146')?.disabled, false);
  });

  it('enrolls a Second Factor on an Operator Account', async () => {
    const { generateTotpSecret, totpCodeAt } = await import('./totp.ts');
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    const secret = generateTotpSecret();
    const now = Date.parse('2026-08-01T00:00:00.000Z');
    const bad = store.enrollSecondFactor({
      username: 'mc00146',
      secret,
      code: '000000',
      now: new Date(now),
    });
    assert.equal(bad.ok, false);
    const ok = store.enrollSecondFactor({
      username: 'mc00146',
      secret,
      code: totpCodeAt(secret, now),
      now: new Date(now),
    });
    assert.equal(ok.ok, true);
    assert.equal(store.getOperatorAccount('mc00146')?.secondFactorEnrolled, true);
  });

  it('lists Operator Accounts without secrets', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    await store.createOperatorAccount({
      actorUsername: 'mc00146',
      username: 'intern',
      email: 'intern@corp.example',
      displayName: 'Test Person',
      role: 'viewer',
    });
    const list = store.listOperatorAccounts();
    assert.equal(list.length, 2);
    assert.equal(list.some((a) => a.username === 'intern' && a.role === 'viewer'), true);
    assert.equal(
      list.every((a) => !('password_hash' in a) && !('totp_secret' in a)),
      true,
    );
  });

  it('reports last successful Login Event time and unmatched Username attempts', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    const t0 = new Date('2026-08-01T00:00:00.000Z');
    store.appendLoginEvent({
      username: 'mc00146',
      outcome: 'failure',
      clientIp: '192.0.2.15',
      at: t0,
    });
    store.appendLoginEvent({
      username: 'mc00146',
      outcome: 'success',
      clientIp: '192.0.2.15',
      at: new Date('2026-08-01T01:00:00.000Z'),
    });
    store.appendLoginEvent({
      username: 'ghost',
      outcome: 'failure',
      clientIp: '192.0.2.17',
      at: new Date('2026-08-01T02:00:00.000Z'),
    });
    assert.equal(store.lastSuccessfulLoginAt('mc00146'), '2026-08-01T01:00:00.000Z');
    assert.equal(store.lastSuccessfulLoginAt('intern'), null);
    const unmatched = store.listUnmatchedLoginEvents();
    assert.equal(unmatched.length, 1);
    assert.equal(unmatched[0]?.username, 'ghost');
  });

  it('lists active Sessions with timestamps', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    const t0 = new Date('2026-08-01T00:00:00.000Z');
    const session = store.createSession({
      username: 'mc00146',
      clientIp: '192.0.2.15',
      userAgent: 'vitest',
      now: t0,
    });
    const listed = store.listSessions({ username: 'mc00146', now: t0 });
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, session.id);
    assert.equal(listed[0]?.createdAt, '2026-08-01T00:00:00.000Z');
  });

  it('enables a disabled Operator Account without restoring Sessions', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    await store.createOperatorAccount({
      actorUsername: 'mc00146',
      username: 'intern',
      email: 'intern@corp.example',
      displayName: 'Test Person',
      role: 'viewer',
    });
    const session = store.createSession({ username: 'intern', clientIp: '192.0.2.15' });
    assert.equal(store.disableOperatorAccount({ actorUsername: 'mc00146', username: 'intern' }).ok, true);
    assert.equal(store.getSession(session.id), null);
    assert.equal(store.enableOperatorAccount({ actorUsername: 'mc00146', username: 'intern' }).ok, true);
    assert.equal(store.getOperatorAccount('intern')?.disabled, false);
    assert.equal(store.countSessions({ username: 'intern' }), 0);
  });

  it('updates Operator Email and Role but will not demote the last Platform Owner', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    const demote = store.updateOperatorAccount({
      actorUsername: 'mc00146',
      username: 'mc00146',
      role: 'operator',
    });
    assert.equal(demote.ok, false);
    const email = store.updateOperatorAccount({
      actorUsername: 'mc00146',
      username: 'mc00146',
      email: 'owner@corp.example',
    });
    assert.equal(email.ok, true);
    assert.equal(store.getOperatorAccount('mc00146')?.email, 'owner@corp.example');
    assert.equal(store.getOperatorAccount('mc00146')?.role, 'platform_owner');
  });

  it('resets password with a Temporary Password and clears Second Factor and Sessions', async () => {
    const { generateTotpSecret, totpCodeAt } = await import('./totp.ts');
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    await store.createOperatorAccount({
      actorUsername: 'mc00146',
      username: 'intern',
      email: 'intern@corp.example',
      displayName: 'Test Person',
      role: 'viewer',
    });
    const secret = generateTotpSecret();
    const now = Date.parse('2026-08-01T00:00:00.000Z');
    store.enrollSecondFactor({
      username: 'intern',
      secret,
      code: totpCodeAt(secret, now),
      now: new Date(now),
    });
    const session = store.createSession({ username: 'intern', clientIp: '192.0.2.15' });
    const reset = await store.resetOperatorPassword({
      actorUsername: 'mc00146',
      username: 'intern',
    });
    assert.equal(reset.ok, true);
    if (!reset.ok) return;
    assert.ok(reset.temporaryPassword.length >= 12);
    assert.equal(store.getOperatorAccount('intern')?.secondFactorEnrolled, false);
    assert.equal(store.getSession(session.id), null);
    assert.equal(await store.verifyOperatorPassword('intern', reset.temporaryPassword), true);
  });

  it('clears a Login Lockout with an unlock Login Event', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    await store.createOperatorAccount({
      actorUsername: 'mc00146',
      username: 'intern',
      email: 'intern@corp.example',
      displayName: 'Test Person',
      role: 'viewer',
    });
    const t0 = new Date('2026-08-01T00:00:00.000Z');
    for (let i = 0; i < 5; i++) {
      store.appendLoginEvent({
        username: 'intern',
        outcome: 'failure',
        clientIp: '192.0.2.15',
        at: new Date(t0.getTime() + i * 1000),
      });
    }
    assert.equal(store.isLoginLocked('intern', new Date('2026-08-01T00:00:10.000Z')), true);
    const cleared = store.clearLoginLockout({
      actorUsername: 'mc00146',
      username: 'intern',
      now: new Date('2026-08-01T00:00:10.000Z'),
    });
    assert.equal(cleared.ok, true);
    assert.equal(store.isLoginLocked('intern', new Date('2026-08-01T00:00:10.000Z')), false);
    assert.equal(
      store.listLoginEvents({ username: 'intern' }).some((e) => e.outcome === 'unlock'),
      true,
    );
  });

  it('changes own Lasting Password with current password and min length', async () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    await store.seedFirstOperatorIfEmpty({
      username: 'mc00146',
      email: 'mc00146@corp.example',
      password: 'admin123',
    });
    const tooShort = await store.changeOwnLastingPassword({
      username: 'mc00146',
      currentPassword: 'admin123',
      newPassword: 'short',
    });
    assert.equal(tooShort.ok, false);
    const ok = await store.changeOwnLastingPassword({
      username: 'mc00146',
      currentPassword: 'admin123',
      newPassword: 'lasting-pass-1',
    });
    assert.equal(ok.ok, true);
    assert.equal(await store.verifyOperatorPassword('mc00146', 'lasting-pass-1'), true);
    assert.equal(await store.verifyOperatorPassword('mc00146', 'admin123'), false);
  });
});

describe('Local Settings Store — Live Pod Diagnostics occupancy', () => {
  it('begins shared occupancy after trigger accept and blocks a second in-flight start', () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    const key = { siteId: 'yt', namespace: 'mes', pod: 'api-7f9' };
    const first = store.beginLivePodOccupancy(key, 'task-1');
    assert.equal(first.ok, true);
    const occupied = store.getLivePodOccupancy(key);
    assert.equal(occupied?.taskId, 'task-1');
    assert.equal(occupied?.inFlight, true);
    const second = store.beginLivePodOccupancy(key, 'task-2');
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.code, 'IN_FLIGHT');
    assert.equal(store.getLivePodOccupancy(key)?.taskId, 'task-1');
  });

  it('releases in-flight on Store terminal status and then allows a re-run', () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    const key = { siteId: 'yt', namespace: 'mes', pod: 'api-7f9' };
    assert.equal(store.beginLivePodOccupancy(key, 'task-1').ok, true);
    store.completeLivePodOccupancy('task-1');
    const done = store.getLivePodOccupancy(key);
    assert.equal(done?.inFlight, false);
    assert.equal(done?.taskId, 'task-1');
    const again = store.beginLivePodOccupancy(key, 'task-2');
    assert.equal(again.ok, true);
    assert.equal(store.getLivePodOccupancy(key)?.taskId, 'task-2');
    assert.equal(store.getLivePodOccupancy(key)?.inFlight, true);
  });

  it('lists occupancy for a Site so every row of that pod can show the latest Task', () => {
    const dbPath = tmpDb();
    const store = openLocalSettingsStore(dbPath);
    stores.push(store);
    store.beginLivePodOccupancy({ siteId: 'yt', namespace: 'mes', pod: 'a' }, 't-a');
    store.beginLivePodOccupancy({ siteId: 'yt', namespace: 'other', pod: 'b' }, 't-b');
    store.beginLivePodOccupancy({ siteId: 'lh', namespace: 'mes', pod: 'a' }, 't-lh');
    const yt = store.listLivePodOccupancy('yt');
    assert.equal(yt.length, 2);
    assert.equal(yt.some((r) => r.taskId === 't-lh'), false);
  });
});
