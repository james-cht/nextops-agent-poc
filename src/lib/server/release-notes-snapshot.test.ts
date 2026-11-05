import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { openLocalSettingsStore, type LocalSettingsStore } from './local-settings-store.ts';
import { markReleaseNotesRead, releaseNotesSnapshot } from './release-notes-snapshot.ts';

const dirs: string[] = [];
const stores: LocalSettingsStore[] = [];

afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmpStore(): LocalSettingsStore {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-rn-'));
  dirs.push(d);
  const store = openLocalSettingsStore(path.join(d, 'nextops.sqlite'));
  stores.push(store);
  return store;
}

describe('Release Notes snapshot', () => {
  it('is unread until the running Version is marked Last-Read', () => {
    const store = tmpStore();
    const first = releaseNotesSnapshot(store, 'alice');
    assert.equal(first.runningVersion, '1.4.0');
    assert.equal(first.lastRead, null);
    assert.equal(first.unread, true);
    assert.ok(first.releases[0]?.notes.some((n) => n.id === '1.4.0-live-pod-diagnostics-reading'));
    assert.ok(first.releases.some((r) => r.version === '1.3.2'));
    assert.ok(first.releases.some((r) => r.version === '1.3.1'));
    assert.ok(first.releases.some((r) => r.version === '1.3.0'));
    assert.ok(first.releases.some((r) => r.version === '1.2.0'));
    assert.ok(first.releases.some((r) => r.version === '1.1.0'));
    assert.ok(first.releases.some((r) => r.version === '1.0.0'));

    const marked = markReleaseNotesRead(store, 'alice');
    assert.equal(marked.lastRead, '1.4.0');
    assert.equal(marked.unread, false);
    assert.equal(releaseNotesSnapshot(store, 'bob').unread, true);
  });
});
