import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  saveServiceDeploySpecArtifacts,
  saveServiceDeploySpecDraft,
  submitServiceDeploySpec,
  type CentralPipelineGitLabPort,
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
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-submit-'));
  dirs.push(d);
  const store = openApplicationOnlineStore(path.join(d, 'application-online.sqlite'));
  stores.push(store);
  return store;
}

function account(role: OperatorRole, username = 'lin.dev') {
  return { username, role, disabled: false };
}

function fakeGitLab(): CentralPipelineGitLabPort & {
  calls: Array<Record<string, unknown>>;
  mergeAttempts: number;
} {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    mergeAttempts: 0,
    async openMergeRequest(opts) {
      calls.push({
        projectPath: opts.projectPath,
        sourceBranch: opts.sourceBranch,
        targetBranch: opts.targetBranch,
        title: opts.title,
        paths: opts.files.map((f) => f.path),
        contents: opts.files.map((f) => f.content),
      });
      return {
        ok: true,
        mrUrl: `https://gitlab.example/${opts.projectPath}/-/merge_requests/4321`,
        mrIid: 4321,
      };
    },
    async getMergeRequestState() {
      return { ok: true as const, merged: false as const };
    },
  };
}

describe('submit Service Deploy Spec → central GitLab MR', () => {
  it('rejects incomplete Pipeline block; allows empty Resource Requests', async () => {
    const store = openStore();
    store.createProject({ nameSpace: 'efactory' });
    store.addMembership({ nameSpace: 'efactory', username: 'lin.dev' });
    const gitlab = fakeGitLab();
    const denied = await submitServiceDeploySpec({
      store,
      account: account('application_developer'),
      nameSpace: 'efactory',
      appName: 'missing',
      gitlab,
      machineToken: 'bot-tok',
      centralProjectPath: 'dgroup_devops/cicd/jenkins-deployment-pipeline',
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, 'NOT_FOUND');
    assert.equal(gitlab.calls.length, 0);
  });

  it('opens an MR with deploy/<NAME_SPACE>/<APP_NAME>/ files via machine account; does not merge', async () => {
    const store = openStore();
    store.createProject({ nameSpace: 'efactory' });
    store.addMembership({ nameSpace: 'efactory', username: 'lin.dev' });
    assert.equal(
      saveServiceDeploySpecDraft({
        store,
        account: account('application_developer'),
        input: {
          nameSpace: 'efactory',
          appName: 'efactory-ap',
          gitlabUrl: 'https://gitlab.example/smfg/efactory.git',
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
        account: account('application_developer'),
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
          runtimeEnv: { SPRING_PROFILES_ACTIVE: 'dev' },
        },
      }).ok,
      true,
    );

    const gitlab = fakeGitLab();
    const result = await submitServiceDeploySpec({
      store,
      account: account('application_developer'),
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      gitlab,
      machineToken: 'bot-tok',
      centralProjectPath: 'dgroup_devops/cicd/jenkins-deployment-pipeline',
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.match(result.mrUrl, /merge_requests\/4321/);
      assert.equal(result.canMergeFromNextOps, false);
    }
    assert.equal(gitlab.calls.length, 1);
    const call = gitlab.calls[0]!;
    assert.equal(call.targetBranch, 'main');
    assert.equal(
      (call.paths as string[]).some((p) => /Jenkinsfile/i.test(p)),
      false,
    );
    assert.ok(
      (call.paths as string[]).includes('deploy/efactory/efactory-ap/Dockerfile'),
    );
    assert.equal(
      (call.contents as string[]).some((c) => /password\s*[:=]/i.test(c)),
      false,
    );
    assert.equal(gitlab.mergeAttempts, 0);

    const draft = store.getSpecDraft('efactory', 'efactory-ap');
    assert.equal(draft?.mrUrl, result.ok ? result.mrUrl : null);
  });

  it('blocks Viewer from submit', async () => {
    const store = openStore();
    store.createProject({ nameSpace: 'efactory' });
    const gitlab = fakeGitLab();
    const result = await submitServiceDeploySpec({
      store,
      account: account('viewer', 'watch'),
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      gitlab,
      machineToken: 'bot-tok',
      centralProjectPath: 'dgroup_devops/cicd/jenkins-deployment-pipeline',
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'FORBIDDEN');
  });
});
