import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  publishMergedSpecAndCreateDevJob,
  saveServiceDeploySpecArtifacts,
  saveServiceDeploySpecDraft,
  submitServiceDeploySpec,
  triggerDevValidate,
  type CentralPipelineGitLabPort,
  type JenkinsDevRunPort,
  type KubeSphereJobPort,
} from './application-online-actions.ts';
import { openApplicationOnlineStore, type ApplicationOnlineStore } from './application-online-store.ts';

const dirs: string[] = [];
const stores: ApplicationOnlineStore[] = [];

afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function openStore(): ApplicationOnlineStore {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-validate-'));
  dirs.push(d);
  const store = openApplicationOnlineStore(path.join(d, 'application-online.sqlite'));
  stores.push(store);
  return store;
}

function fakeGitLab(): CentralPipelineGitLabPort {
  return {
    async openMergeRequest() {
      return { ok: true, mrUrl: 'https://gitlab.example/mr/1', mrIid: 1 };
    },
    async getMergeRequestState() {
      return { ok: true, merged: true, sha: 'pinnedsha99' };
    },
  };
}

function fakeKube(): KubeSphereJobPort & { created: number } {
  const state = { created: 0 };
  return {
    get created() {
      return state.created;
    },
    async createPipelineJob() {
      state.created += 1;
      return { ok: true, jobId: 'job-efactory-ap-dev' };
    },
  };
}

function fakeJenkins(): JenkinsDevRunPort & {
  enqueued: Array<Record<string, unknown>>;
} {
  const enqueued: Array<Record<string, unknown>> = [];
  return {
    enqueued,
    async enqueueDevValidate(req) {
      enqueued.push({ ...req });
      return {
        ok: true,
        runId: 'run-1',
        status: 'queued' as const,
      };
    },
    async getDevRunStatus(opts) {
      return {
        ok: true,
        runId: opts.runId,
        status: 'success_apply' as const,
      };
    },
  };
}

async function seedPublished(store: ApplicationOnlineStore) {
  store.createProject({ nameSpace: 'efactory' });
  store.addMembership({ nameSpace: 'efactory', username: 'lin.dev' });
  assert.equal(
    saveServiceDeploySpecDraft({
      store,
      account: { username: 'lin.dev', role: 'application_developer', disabled: false },
      input: {
        nameSpace: 'efactory',
        appName: 'efactory-ap',
        gitlabUrl: 'https://gitlab.example/efactory.git',
        promotionPath: 'dev→prod',
        templateFamily: 'promote',
        packagingCommand: 'mvn -DskipTests package',
        defaultRef: 'release/1.2',
        k8sNamespace: '',
      },
    }).ok,
    true,
  );
  assert.equal(
    saveServiceDeploySpecArtifacts({
      store,
      account: { username: 'lin.dev', role: 'application_developer', disabled: false },
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      generate: {
        baseImage: '192.0.2.6:30002/base/rockylinux8-openjdk21:2025-01',
        artifactPath: 'target/*.jar',
        workdir: '/app',
        entrypoint: '["java","-jar","/app/app.jar"]',
        port: 8080,
        replicas: 1,
        cpu: '500m',
        memory: '1Gi',
        runtimeEnv: {},
      },
    }).ok,
    true,
  );
  assert.equal(
    (
      await submitServiceDeploySpec({
        store,
        account: { username: 'lin.dev', role: 'application_developer', disabled: false },
        nameSpace: 'efactory',
        appName: 'efactory-ap',
        gitlab: fakeGitLab(),
        machineToken: 'bot',
        centralProjectPath: 'central',
      })
    ).ok,
    true,
  );
  const kube = fakeKube();
  const published = await publishMergedSpecAndCreateDevJob({
    store,
    account: { username: 'ops', role: 'operator', disabled: false },
    nameSpace: 'efactory',
    appName: 'efactory-ap',
    gitlab: fakeGitLab(),
    kube,
    machineToken: 'bot',
    centralProjectPath: 'central',
    credentialIds: ['harbor-dev'],
  });
  assert.equal(published.ok, true);
  return kube;
}

describe('在 Dev 驗證 at pinned SHA', () => {
  it('does not auto-enqueue on merge/publish; only explicit trigger enqueues', async () => {
    const store = openStore();
    const kube = await seedPublished(store);
    assert.equal(kube.created, 1);
    assert.equal(store.getSpecDraft('efactory', 'efactory-ap')?.lastDevRunId, null);

    const jenkins = fakeJenkins();
    const triggered = await triggerDevValidate({
      store,
      account: { username: 'lin.dev', role: 'application_developer', disabled: false },
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      jenkins,
    });
    assert.equal(triggered.ok, true);
    assert.equal(jenkins.enqueued.length, 1);
    assert.equal(jenkins.enqueued[0]?.pinnedSha, 'pinnedsha99');
    assert.equal(jenkins.enqueued[0]?.defaultRef, 'release/1.2');
    assert.equal(Object.hasOwn(jenkins.enqueued[0] ?? {}, 'draftSha'), false);

    const draft = store.getSpecDraft('efactory', 'efactory-ap');
    assert.equal(draft?.lastDevRunId, 'run-1');
    assert.equal(draft?.lastDevRunStatus, 'queued');
  });

  it('blocks non-member Developer and Viewer; Operator may trigger', async () => {
    const store = openStore();
    await seedPublished(store);
    const jenkins = fakeJenkins();

    const outsider = await triggerDevValidate({
      store,
      account: { username: 'other.dev', role: 'application_developer', disabled: false },
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      jenkins,
    });
    assert.equal(outsider.ok, false);
    if (!outsider.ok) assert.equal(outsider.code, 'FORBIDDEN');

    const viewer = await triggerDevValidate({
      store,
      account: { username: 'watch', role: 'viewer', disabled: false },
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      jenkins,
    });
    assert.equal(viewer.ok, false);

    const ops = await triggerDevValidate({
      store,
      account: { username: 'ops', role: 'operator', disabled: false },
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      jenkins,
    });
    assert.equal(ops.ok, true);
  });

  it('refuses trigger without published pin', async () => {
    const store = openStore();
    store.createProject({ nameSpace: 'efactory' });
    store.addMembership({ nameSpace: 'efactory', username: 'lin.dev' });
    assert.equal(
      saveServiceDeploySpecDraft({
        store,
        account: { username: 'lin.dev', role: 'application_developer', disabled: false },
        input: {
          nameSpace: 'efactory',
          appName: 'efactory-ap',
          gitlabUrl: 'https://gitlab.example/efactory.git',
          promotionPath: 'dev→prod',
          templateFamily: 'promote',
          packagingCommand: 'mvn',
          defaultRef: 'main',
          k8sNamespace: '',
        },
      }).ok,
      true,
    );
    const jenkins = fakeJenkins();
    const result = await triggerDevValidate({
      store,
      account: { username: 'lin.dev', role: 'application_developer', disabled: false },
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      jenkins,
    });
    assert.equal(result.ok, false);
    assert.equal(jenkins.enqueued.length, 0);
  });
});
