import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  addProjectMembership,
  createApplicationOnlineProject,
  listApplicationOnlineHome,
  removeProjectMembership,
  saveServiceDeploySpecArtifacts,
  saveServiceDeploySpecDraft,
  saveServiceDeployResourceRequests,
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
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-online-act-'));
  dirs.push(d);
  const store = openApplicationOnlineStore(path.join(d, 'application-online.sqlite'));
  stores.push(store);
  return store;
}

function account(role: OperatorRole, username = 'actor', disabled = false) {
  return { username, role, disabled };
}

describe('Application Online session actions', () => {
  it('lists only membership Projects for a Developer home', () => {
    const store = openStore();
    store.createProject({ nameSpace: 'efactory' });
    store.createProject({ nameSpace: 'other' });
    store.addMembership({ nameSpace: 'efactory', username: 'lin.dev' });

    const home = listApplicationOnlineHome({
      store,
      account: account('application_developer', 'lin.dev'),
      developerAccounts: [{ username: 'lin.dev', role: 'application_developer', disabled: false }],
    });
    assert.deepEqual(
      home.projects.map((p) => p.nameSpace),
      ['efactory'],
    );
    assert.equal(home.canManageMembership, false);
  });

  it('lets Operator create a Project and add/remove an Application Developer', () => {
    const store = openStore();
    const created = createApplicationOnlineProject({
      store,
      account: account('operator', 'ops'),
      nameSpace: 'efactory',
    });
    assert.equal(created.ok, true);

    const added = addProjectMembership({
      store,
      account: account('operator', 'ops'),
      nameSpace: 'efactory',
      username: 'lin.dev',
      targetAccount: { username: 'lin.dev', role: 'application_developer', disabled: false },
    });
    assert.equal(added.ok, true);

    const denied = addProjectMembership({
      store,
      account: account('application_developer', 'lin.dev'),
      nameSpace: 'efactory',
      username: 'other.dev',
      targetAccount: { username: 'other.dev', role: 'application_developer', disabled: false },
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, 'FORBIDDEN');

    const viewerDenied = addProjectMembership({
      store,
      account: account('viewer', 'watch'),
      nameSpace: 'efactory',
      username: 'other.dev',
      targetAccount: { username: 'other.dev', role: 'application_developer', disabled: false },
    });
    assert.equal(viewerDenied.ok, false);

    const removed = removeProjectMembership({
      store,
      account: account('platform_owner', 'owner'),
      nameSpace: 'efactory',
      username: 'lin.dev',
    });
    assert.equal(removed.ok, true);
  });

  it('rejects membership for non-Developer accounts', () => {
    const store = openStore();
    store.createProject({ nameSpace: 'efactory' });
    const result = addProjectMembership({
      store,
      account: account('operator', 'ops'),
      nameSpace: 'efactory',
      username: 'ops2',
      targetAccount: { username: 'ops2', role: 'operator', disabled: false },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'BAD_REQUEST');
  });

  it('lets a member Developer save a Pipeline-block Spec draft; Viewer cannot', () => {
    const store = openStore();
    store.createProject({ nameSpace: 'efactory' });
    store.addMembership({ nameSpace: 'efactory', username: 'lin.dev' });

    const saved = saveServiceDeploySpecDraft({
      store,
      account: account('application_developer', 'lin.dev'),
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
    });
    assert.equal(saved.ok, true);
    if (saved.ok) {
      assert.equal(saved.draft.publishedPinSha, null);
      assert.equal(saved.pipelineBlockComplete, true);
    }

    const viewer = saveServiceDeploySpecDraft({
      store,
      account: account('viewer', 'watch'),
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
    });
    assert.equal(viewer.ok, false);
    if (!viewer.ok) assert.equal(viewer.code, 'FORBIDDEN');

    const home = listApplicationOnlineHome({
      store,
      account: account('operator', 'ops'),
      developerAccounts: [{ username: 'lin.dev', role: 'application_developer', disabled: false }],
    });
    assert.equal(home.projects[0]?.drafts?.[0]?.appName, 'efactory-ap');
    assert.equal(home.projects[0]?.drafts?.[0]?.publishedPinSha, null);
  });

  it('generates and saves Dockerfile/Kustomize previews for a Spec draft', () => {
    const store = openStore();
    store.createProject({ nameSpace: 'efactory' });
    store.addMembership({ nameSpace: 'efactory', username: 'lin.dev' });
    assert.equal(
      saveServiceDeploySpecDraft({
        store,
        account: account('application_developer', 'lin.dev'),
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

    const saved = saveServiceDeploySpecArtifacts({
      store,
      account: account('application_developer', 'lin.dev'),
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
    });
    assert.equal(saved.ok, true);
    if (saved.ok) {
      assert.doesNotMatch(saved.artifacts.dockerfile.content, /mvn/);
      assert.equal(saved.artifacts.dockerfile.dirty, false);
      assert.match(saved.artifacts.kustomize.base, /Deployment/);
    }
  });

  it('saves optional Resource Requests without gating Pipeline-block completeness; strips secrets', () => {
    const store = openStore();
    store.createProject({ nameSpace: 'efactory' });
    store.addMembership({ nameSpace: 'efactory', username: 'lin.dev' });
    const draft = saveServiceDeploySpecDraft({
      store,
      account: account('application_developer', 'lin.dev'),
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
    });
    assert.equal(draft.ok, true);
    if (draft.ok) assert.equal(draft.pipelineBlockComplete, true);

    const rr = saveServiceDeployResourceRequests({
      store,
      account: account('application_developer', 'lin.dev'),
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      sheets: [
        { kind: 'db', fields: { type: 'SQLServer', password: 'nope', host: 'db.example' } },
        { kind: 'minio', fields: {} },
      ],
    });
    assert.equal(rr.ok, true);
    if (rr.ok) {
      const db = rr.sheets.find((s) => s.kind === 'db');
      assert.equal(db?.status, 'needed');
      assert.equal(db?.fields.password, undefined);
      assert.equal(db?.fields.host, 'db.example');
      assert.equal(rr.sheets.find((s) => s.kind === 'minio')?.status, 'not_needed');
    }
  });
});
