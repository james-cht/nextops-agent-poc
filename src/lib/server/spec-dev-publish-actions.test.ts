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
  type CentralPipelineGitLabPort,
  type KubeSphereJobPort,
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
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-publish-'));
  dirs.push(d);
  const store = openApplicationOnlineStore(path.join(d, 'application-online.sqlite'));
  stores.push(store);
  return store;
}

function account(role: OperatorRole = 'operator', username = 'ops') {
  return { username, role, disabled: false };
}

function fakeGitLab(opts?: { merged?: boolean; sha?: string }): CentralPipelineGitLabPort & {
  jobEnvsCreated: string[];
} {
  return {
    jobEnvsCreated: [],
    async openMergeRequest() {
      return {
        ok: true,
        mrUrl: 'https://gitlab.example/central/-/merge_requests/1',
        mrIid: 1,
      };
    },
    async getMergeRequestState() {
      if (opts?.merged === false) return { ok: true as const, merged: false as const };
      return {
        ok: true as const,
        merged: true as const,
        sha: opts?.sha ?? 'pubsha001',
      };
    },
  };
}

function fakeKube(): KubeSphereJobPort & { created: Array<Record<string, unknown>> } {
  const created: Array<Record<string, unknown>> = [];
  return {
    created,
    async createPipelineJob(job) {
      created.push({ ...job });
      return { ok: true, jobId: `job-${job.name}` };
    },
  };
}

async function seedSubmitted(store: ApplicationOnlineStore) {
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
        defaultRef: 'main',
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
  const gitlab = fakeGitLab();
  const submitted = await submitServiceDeploySpec({
    store,
    account: { username: 'lin.dev', role: 'application_developer', disabled: false },
    nameSpace: 'efactory',
    appName: 'efactory-ap',
    gitlab,
    machineToken: 'bot',
    centralProjectPath: 'dgroup_devops/cicd/jenkins-deployment-pipeline',
  });
  assert.equal(submitted.ok, true);
}

describe('publish merged Spec and create Dev job only', () => {
  it('records published SHA and creates only Dev job without Dockerfile on the job', async () => {
    const store = openStore();
    await seedSubmitted(store);
    const gitlab = fakeGitLab({ merged: true, sha: 'abcmerged' });
    const kube = fakeKube();
    const result = await publishMergedSpecAndCreateDevJob({
      store,
      account: account('operator'),
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      gitlab,
      kube,
      machineToken: 'bot',
      centralProjectPath: 'central',
      credentialIds: ['harbor-dev', 'kube-dev'],
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.publishedPinSha, 'abcmerged');
      assert.equal(result.devJobId, 'job-efactory-ap-dev');
    }
    assert.equal(kube.created.length, 1);
    assert.equal(kube.created[0]?.environment, 'dev');
    assert.equal(Object.hasOwn(kube.created[0] ?? {}, 'dockerfile'), false);
    assert.equal(Object.hasOwn(kube.created[0] ?? {}, 'packagingCommand'), false);

    const draft = store.getSpecDraft('efactory', 'efactory-ap');
    assert.equal(draft?.publishedPinSha, 'abcmerged');
    assert.equal(draft?.devJobId, 'job-efactory-ap-dev');
    assert.deepEqual(store.listEnvironmentPins('efactory', 'efactory-ap'), [
      {
        environment: 'dev',
        publishedPinSha: 'abcmerged',
        jobId: 'job-efactory-ap-dev',
        imageTag: null,
        sourceImage: null,
        templateFamily: 'promote',
        lastRunStatus: null,
      },
    ]);
  });

  it('does not create QA/UAT/Prod jobs and does not pin from an unmerged MR', async () => {
    const store = openStore();
    await seedSubmitted(store);
    const gitlab = fakeGitLab({ merged: false });
    const kube = fakeKube();
    const result = await publishMergedSpecAndCreateDevJob({
      store,
      account: account('operator'),
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      gitlab,
      kube,
      machineToken: 'bot',
      centralProjectPath: 'central',
      credentialIds: ['harbor-dev'],
    });
    assert.equal(result.ok, false);
    assert.equal(kube.created.length, 0);
    assert.equal(store.getSpecDraft('efactory', 'efactory-ap')?.publishedPinSha, null);
  });
});
