import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  appendConfigAuditEntry,
  listConfigAuditEntries,
  _resetConfigAuditForTests,
} from './config-audit-log.ts';
import { openLocalSettingsStore, type LocalSettingsStore } from './local-settings-store.ts';

const dirs: string[] = [];
const stores: LocalSettingsStore[] = [];

afterEach(() => {
  _resetConfigAuditForTests();
  for (const s of stores.splice(0)) s.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('config audit log', () => {
  it('appends entries without secret plaintext via Local Settings Store', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-audit-'));
    dirs.push(d);
    const store = openLocalSettingsStore(path.join(d, 'nextops.sqlite'));
    stores.push(store);
    const lines: string[] = [];
    appendConfigAuditEntry(
      {
        action: 'save',
        setting: 'dify_credentials',
        outcome: 'saved',
        actor: 'admin',
        detail: { fieldsChanged: ['apiKey', 'baseUrl'] },
      },
      {
        store,
        logLine: (line) => lines.push(line),
      },
    );
    const entries = listConfigAuditEntries({ store, limit: 10 });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].setting, 'dify_credentials');
    assert.ok(!JSON.stringify(entries[0]).includes('app-secret'));
    assert.ok(lines[0].includes('config_audit'));
  });

  it('lists newest first and respects limit', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-audit-'));
    dirs.push(d);
    const store = openLocalSettingsStore(path.join(d, 'nextops.sqlite'));
    stores.push(store);
    for (let i = 0; i < 5; i++) {
      appendConfigAuditEntry(
        {
          action: 'save',
          setting: 'mysql_proxy',
          outcome: 'saved',
          actor: 'admin',
          detail: { i },
        },
        { store, logLine: () => {} },
      );
    }
    const entries = listConfigAuditEntries({ store, limit: 3 });
    assert.equal(entries.length, 3);
    assert.equal((entries[0].detail as { i: number }).i, 4);
  });
});
