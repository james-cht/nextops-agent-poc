import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  releaseNextHop,
  saveServiceDeployEnvironmentBindings,
  saveServiceDeploySpecDraft,
} from './application-online-actions.ts';
import { openApplicationOnlineStore, type ApplicationOnlineStore } from './application-online-store.ts';
import type { OperatorRole } from '../operator-role.ts';

const dirs: string[] = [];
const stores: ApplicationOnlineStore[] = [];

afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function openStore(): ApplicationOnlineStore {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-ladder-'));
  dirs.push(d);
  const store = openApplicationOnlineStore(path.join(d, 'application-online.sqlite'));
  stores.push(store);
  return store;
}

function account(role: OperatorRole, username = 'ops') {
  return { username, role, disabled: false };
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

function seedDevGreen(store: ApplicationOnlineStore, path: 'dev→qa→prod' | 'dev→prod' = 'dev→qa→prod') {
  store.createProject({ nameSpace: 'efactory' });
  store.addMembership({ nameSpace: 'efactory', username: 'lin.dev' });
  assert.equal(
    store.saveSpecDraft({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      gitlabUrl: 'https://gitlab.example/a.git',
      promotionPath: path,
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
      publishedPinSha: 'sha-dev-1',
      devJobId: 'job-efactory-ap-dev',
    }).ok,
    true,
  );
  assert.equal(
    store.recordDevValidateRun({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      runId: 'run-dev-1',
      status: 'success_apply',
    }).ok,
    true,
  );
  store.saveResourceRequests({
    nameSpace: 'efactory',
    appName: 'efactory-ap',
    sheets: [
      { kind: 'db', status: 'needed', fields: { type: 'SQLServer' } },
      { kind: 'files', status: 'not_needed', fields: {} },
      { kind: 'networks', status: 'not_needed', fields: {} },
      { kind: 'middleware', status: 'not_needed', fields: {} },
      { kind: 'vm', status: 'not_needed', fields: {} },
      { kind: 'minio', status: 'not_needed', fields: {} },
      { kind: 'domains', status: 'not_needed', fields: {} },
    ],
    updatedBy: 'ops',
  });
}

describe('Promotion Path ladder release', () => {
  it('releases QA with SOURCE_IMAGE from Dev; pins prior SHA; rejects Developer and Binding fail; keeps old hop pin after new Spec SHA', async () => {
    const store = openStore();
    seedDevGreen(store);
    const kube = fakeKube();

    const noBind = await releaseNextHop({
      store,
      account: account('operator'),
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      targetEnvironment: 'qa',
      imageTag: 'sha-dev-1',
      credentialIds: ['cred-git'],
      kubeSphere: kube,
    });
    assert.equal(noBind.ok, false);

    assert.equal(
      saveServiceDeployEnvironmentBindings({
        store,
        account: account('operator'),
        nameSpace: 'efactory',
        appName: 'efactory-ap',
        bindings: [
          { environment: 'qa', kind: 'db', fields: { host: 'qa-db' } },
          { environment: 'prod', kind: 'db', fields: { host: 'prod-db' } },
        ],
      }).ok,
      true,
    );

    const deniedDev = await releaseNextHop({
      store,
      account: account('application_developer', 'lin.dev'),
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      targetEnvironment: 'qa',
      imageTag: 'sha-dev-1',
      credentialIds: ['cred-git'],
      kubeSphere: kube,
    });
    assert.equal(deniedDev.ok, false);

    const released = await releaseNextHop({
      store,
      account: account('operator'),
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      targetEnvironment: 'qa',
      imageTag: 'sha-dev-1',
      credentialIds: ['cred-git'],
      kubeSphere: kube,
    });
    assert.equal(released.ok, true);
    assert.equal(kube.created.length, 1);
    assert.equal(kube.created[0].environment, 'qa');
    assert.match(String(kube.created[0].sourceImage), /efactory-ap-dev:sha-dev-1/);
    assert.equal(kube.created[0].publishedPinSha, 'sha-dev-1');

    const pins = store.listEnvironmentPins('efactory', 'efactory-ap');
    assert.ok(pins.some((p) => p.environment === 'qa' && p.publishedPinSha === 'sha-dev-1'));

    // New Spec merge updates Dev published SHA only; QA pin stays until re-release.
    assert.equal(
      store.recordPublishedDevJob({
        nameSpace: 'efactory',
        appName: 'efactory-ap',
        publishedPinSha: 'sha-dev-2',
        devJobId: 'job-efactory-ap-dev',
      }).ok,
      true,
    );
    const pinsAfter = store.listEnvironmentPins('efactory', 'efactory-ap');
    assert.equal(pinsAfter.find((p) => p.environment === 'dev')?.publishedPinSha, 'sha-dev-2');
    assert.equal(pinsAfter.find((p) => p.environment === 'qa')?.publishedPinSha, 'sha-dev-1');

    // Family change without Dev re-walk rejects.
    assert.equal(
      saveServiceDeploySpecDraft({
        store,
        account: account('operator'),
        input: {
          nameSpace: 'efactory',
          appName: 'efactory-ap',
          gitlabUrl: 'https://gitlab.example/a.git',
          promotionPath: 'dev→qa→prod',
          templateFamily: 'web-rebuild',
          packagingCommand: 'npm run build',
          defaultRef: 'main',
          k8sNamespace: '',
        },
      }).ok,
      true,
    );
    store.recordHopRunStatus({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      environment: 'qa',
      status: 'success_apply',
    });
    const familyBlocked = await releaseNextHop({
      store,
      account: account('operator'),
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      targetEnvironment: 'prod',
      imageTag: 'sha-qa',
      credentialIds: ['cred-git'],
      kubeSphere: kube,
    });
    assert.equal(familyBlocked.ok, false);
  });

  it('dev→prod never creates a QA job', async () => {
    const store = openStore();
    seedDevGreen(store, 'dev→prod');
    const kube = fakeKube();
    const bad = await releaseNextHop({
      store,
      account: account('operator'),
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      targetEnvironment: 'qa',
      imageTag: 't',
      credentialIds: [],
      kubeSphere: kube,
    });
    assert.equal(bad.ok, false);
    assert.equal(kube.created.length, 0);
  });
});
