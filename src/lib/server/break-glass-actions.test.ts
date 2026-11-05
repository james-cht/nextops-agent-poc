import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { invokeBreakGlassSkip, listApplicationOnlineHome } from './application-online-actions.ts';
import { openApplicationOnlineStore, type ApplicationOnlineStore } from './application-online-store.ts';

const dirs: string[] = [];
const stores: ApplicationOnlineStore[] = [];

afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function openStore(): ApplicationOnlineStore {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-glass-'));
  dirs.push(d);
  const store = openApplicationOnlineStore(path.join(d, 'application-online.sqlite'));
  stores.push(store);
  return store;
}

describe('Break-glass actions', () => {
  it('rejects Developer/Viewer; Operator records audit; normal release remains default', () => {
    const store = openStore();
    store.createProject({ nameSpace: 'efactory' });
    store.saveSpecDraft({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      gitlabUrl: 'https://gitlab.example/a.git',
      promotionPath: 'dev→qa→prod',
      templateFamily: 'promote',
      packagingCommand: 'mvn',
      defaultRef: 'main',
      k8sNamespace: '',
      updatedBy: 'ops',
    });

    const denied = invokeBreakGlassSkip({
      store,
      account: { username: 'lin.dev', role: 'application_developer', disabled: false },
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      hop: 'qa',
      rule: 'binding_gate',
      reason: 'please',
    });
    assert.equal(denied.ok, false);

    const viewer = invokeBreakGlassSkip({
      store,
      account: { username: 'v', role: 'viewer', disabled: false },
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      hop: 'qa',
      rule: 'binding_gate',
      reason: 'no',
    });
    assert.equal(viewer.ok, false);

    const ok = invokeBreakGlassSkip({
      store,
      account: { username: 'ops', role: 'operator', disabled: false },
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      hop: 'qa',
      rule: 'binding_gate',
      reason: 'DB delayed',
    });
    assert.equal(ok.ok, true);
    const history = store.listBreakGlass('efactory');
    assert.equal(history.length, 1);
    assert.equal(history[0].actor, 'ops');
    assert.equal(history[0].becomesDefaultPath, false);

    const home = listApplicationOnlineHome({
      store,
      account: { username: 'ops', role: 'operator', disabled: false },
      developerAccounts: [],
    });
    assert.ok(home.projects[0].breakGlassHistory.length >= 1);
  });
});
