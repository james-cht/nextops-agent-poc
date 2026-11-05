import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { releaseProdPromote, releaseProdSite } from './application-online-actions.ts';
import { openApplicationOnlineStore, type ApplicationOnlineStore } from './application-online-store.ts';

const dirs: string[] = [];
const stores: ApplicationOnlineStore[] = [];

afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function openStore(): ApplicationOnlineStore {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-prod-'));
  dirs.push(d);
  const store = openApplicationOnlineStore(path.join(d, 'application-online.sqlite'));
  stores.push(store);
  return store;
}

function fakeKube() {
  const created: Array<Record<string, unknown>> = [];
  return {
    created,
    async createPipelineJob(job: Record<string, unknown>) {
      created.push({ ...job });
      return { ok: true as const, jobId: `job-${job.name}` };
    },
  };
}

describe('prod-promote release actions', () => {
  it('creates one prod-promote then independent Site kubectl jobs sharing digest; no control-tower NAME_SPACE', async () => {
    const store = openStore();
    store.createProject({ nameSpace: 'efactory' });
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
    });
    store.recordPublishedDevJob({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      publishedPinSha: 'sha-dev',
      devJobId: 'job-dev',
    });
    store.recordDevValidateRun({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      runId: 'r1',
      status: 'success_apply',
    });
    store.recordHopPin({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      environment: 'prod',
      publishedPinSha: 'sha-dev',
      jobId: 'job-placeholder',
      templateFamily: 'promote',
      imageTag: 'sha-dev',
    });
    store.recordHopRunStatus({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      environment: 'prod',
      status: 'success_apply',
    });

    const kube = fakeKube();
    const promote = await releaseProdPromote({
      store,
      account: { username: 'ops', role: 'operator', disabled: false },
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      imageDigest: 'sha256:deadbeef',
      credentialIds: ['harbor'],
      kubeSphere: kube,
    });
    assert.equal(promote.ok, true);
    assert.equal(kube.created.length, 1);
    assert.equal(kube.created[0].kind, 'prod-promote');
    assert.equal(kube.created[0].runsKubectl, false);
    assert.equal(kube.created[0].nameSpace, 'efactory');

    const siteDenied = await releaseProdSite({
      store,
      account: { username: 'ops', role: 'operator', disabled: false },
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      siteId: 'lh',
      credentialIds: ['kube-lh'],
      kubeSphere: kube,
    });
    // Without promote success recorded — if promote ok, site should work.
    // releaseProdPromote records promote pin; site uses same digest.
    assert.equal(siteDenied.ok, true);
    if (siteDenied.ok) {
      assert.equal(siteDenied.imageDigest, 'sha256:deadbeef');
    }
    const siteJob = kube.created.find((j) => j.kind === 'prod-site');
    assert.ok(siteJob);
    assert.equal(siteJob?.runsSecurityAndPush, false);
    assert.equal(siteJob?.runsKubectl, true);
    assert.equal(siteJob?.imageDigest, 'sha256:deadbeef');
    assert.doesNotMatch(String(siteJob?.nameSpace), /cq|control-tower/);

    const cqMissing = store.listEnvironmentPins('efactory', 'efactory-ap').some(
      (p) => p.environment === 'prod-cq',
    );
    assert.equal(cqMissing, false);
  });
});
