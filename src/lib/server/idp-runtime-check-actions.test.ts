import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { recordRuntimeCheckCallback } from './application-online-actions.ts';
import { openApplicationOnlineStore, type ApplicationOnlineStore } from './application-online-store.ts';

const dirs: string[] = [];
const stores: ApplicationOnlineStore[] = [];

afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function openStore(): ApplicationOnlineStore {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-rtcheck-'));
  dirs.push(d);
  const store = openApplicationOnlineStore(path.join(d, 'application-online.sqlite'));
  stores.push(store);
  return store;
}

describe('Runtime Check callback actions', () => {
  it('stores Runtime Check without changing pins or membership; failed ready keeps Dev success', () => {
    const store = openStore();
    store.createProject({ nameSpace: 'efactory' });
    store.addMembership({ nameSpace: 'efactory', username: 'lin.dev' });
    assert.equal(
      store.saveSpecDraft({
        nameSpace: 'efactory',
        appName: 'efactory-ap',
        gitlabUrl: 'https://gitlab.example/a.git',
        promotionPath: 'dev→prod',
        templateFamily: 'promote',
        packagingCommand: 'mvn',
        defaultRef: 'main',
        k8sNamespace: '',
        updatedBy: 'ops',
      }).ok,
      true,
    );
    assert.equal(
      store.recordPublishedDevJob({
        nameSpace: 'efactory',
        appName: 'efactory-ap',
        publishedPinSha: 'pinned1',
        devJobId: 'job-efactory-ap-dev',
      }).ok,
      true,
    );
    assert.equal(
      store.recordDevValidateRun({
        nameSpace: 'efactory',
        appName: 'efactory-ap',
        runId: 'run-1',
        status: 'success_apply',
      }).ok,
      true,
    );

    const result = recordRuntimeCheckCallback({
      store,
      expectedToken: 'cb-tok',
      providedToken: 'cb-tok',
      body: {
        nameSpace: 'efactory',
        appName: 'efactory-ap',
        runId: 'run-1',
        ready: false,
        probe: 'pod not ready',
        publishedPinSha: 'hijack',
      },
    });
    assert.equal(result.ok, true);
    const draft = store.getSpecDraft('efactory', 'efactory-ap');
    assert.equal(draft?.publishedPinSha, 'pinned1');
    assert.equal(draft?.lastDevRunStatus, 'success_apply');
    assert.equal(draft?.runtimeCheckReady, false);
    assert.match(draft?.runtimeCheckProbe ?? '', /pod not ready/);
    assert.deepEqual(
      store.listMemberships('efactory').map((m) => m.username),
      ['lin.dev'],
    );
  });

  it('rejects wrong callback token', () => {
    const store = openStore();
    const result = recordRuntimeCheckCallback({
      store,
      expectedToken: 'cb-tok',
      providedToken: 'wrong',
      body: { nameSpace: 'efactory', appName: 'a', runId: 'r1', ready: true },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'UNAUTHORIZED');
  });
});
