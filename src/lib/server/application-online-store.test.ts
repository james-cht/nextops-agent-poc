import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  openApplicationOnlineStore,
  type ApplicationOnlineStore,
} from './application-online-store.ts';

const dirs: string[] = [];
const stores: ApplicationOnlineStore[] = [];

afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmpDb(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-online-'));
  dirs.push(d);
  return path.join(d, 'application-online.sqlite');
}

describe('Application Online Store — Project Membership', () => {
  it('persists a Project and membership across reopen', () => {
    const dbPath = tmpDb();
    const store = openApplicationOnlineStore(dbPath);
    stores.push(store);
    const created = store.createProject({ nameSpace: 'efactory' });
    assert.equal(created.ok, true);
    const added = store.addMembership({ nameSpace: 'efactory', username: 'lin.dev' });
    assert.equal(added.ok, true);
    store.close();

    const again = openApplicationOnlineStore(dbPath);
    stores.push(again);
    assert.deepEqual(
      again.listProjects().map((p) => p.nameSpace),
      ['efactory'],
    );
    assert.deepEqual(
      again.listMemberships('efactory').map((m) => m.username),
      ['lin.dev'],
    );
  });

  it('removes a membership and rejects a duplicate add', () => {
    const dbPath = tmpDb();
    const store = openApplicationOnlineStore(dbPath);
    stores.push(store);
    assert.equal(store.createProject({ nameSpace: 'efactory' }).ok, true);
    assert.equal(store.addMembership({ nameSpace: 'efactory', username: 'lin.dev' }).ok, true);
    const dup = store.addMembership({ nameSpace: 'efactory', username: 'lin.dev' });
    assert.equal(dup.ok, false);
    if (!dup.ok) assert.equal(dup.code, 'CONFLICT');
    assert.equal(store.removeMembership({ nameSpace: 'efactory', username: 'lin.dev' }).ok, true);
    assert.deepEqual(store.listMemberships('efactory'), []);
  });

  it('persists a Service Deploy Spec draft without a published pin SHA', () => {
    const dbPath = tmpDb();
    const store = openApplicationOnlineStore(dbPath);
    stores.push(store);
    assert.equal(store.createProject({ nameSpace: 'efactory' }).ok, true);
    const saved = store.saveSpecDraft({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      gitlabUrl: 'https://gitlab.example/efactory.git',
      promotionPath: 'dev→qa→uat→prod',
      templateFamily: 'promote',
      packagingCommand: 'mvn -DskipTests package',
      defaultRef: 'main',
      k8sNamespace: '',
      updatedBy: 'lin.dev',
      now: new Date('2026-03-01T00:00:00.000Z'),
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.draft.publishedPinSha, null);
    store.close();

    const again = openApplicationOnlineStore(dbPath);
    stores.push(again);
    const loaded = again.getSpecDraft('efactory', 'efactory-ap');
    assert.ok(loaded);
    assert.equal(loaded?.appName, 'efactory-ap');
    assert.equal(loaded?.packagingCommand, 'mvn -DskipTests package');
    assert.equal(loaded?.publishedPinSha, null);
    assert.equal(loaded?.k8sNamespace, '');
    assert.deepEqual(
      again.listSpecDrafts('efactory').map((d) => d.appName),
      ['efactory-ap'],
    );
  });

  it('persists Dockerfile and Kustomize previews on a Spec draft', () => {
    const dbPath = tmpDb();
    const store = openApplicationOnlineStore(dbPath);
    stores.push(store);
    assert.equal(store.createProject({ nameSpace: 'efactory' }).ok, true);
    assert.equal(
      store.saveSpecDraft({
        nameSpace: 'efactory',
        appName: 'efactory-ap',
        gitlabUrl: 'https://gitlab.example/efactory.git',
        promotionPath: 'dev→prod',
        templateFamily: 'promote',
        packagingCommand: 'mvn -DskipTests package',
        defaultRef: 'main',
        k8sNamespace: '',
        updatedBy: 'lin.dev',
      }).ok,
      true,
    );
    const saved = store.saveSpecArtifacts({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      dockerfile: {
        content: 'FROM catalog/img:1\nWORKDIR /app\n',
        dirty: false,
        fieldsFingerprint: 'fp1',
        offCatalogFromWarning: false,
      },
      kustomize: {
        base: 'kind: Deployment\n',
        overlaysJson: JSON.stringify({ dev: 'replicas: 1\n', prod: 'replicas: 2\n' }),
        dirty: false,
        fieldsFingerprint: 'kfp1',
      },
      generateFields: {
        baseImage: 'catalog/img:1',
        artifactPath: 'target/*.jar',
        workdir: '/app',
        entrypoint: '["java","-jar","/app/app.jar"]',
        port: 8080,
        replicas: 1,
        cpu: '500m',
        memory: '1Gi',
        runtimeEnvJson: JSON.stringify({ SPRING_PROFILES_ACTIVE: 'dev' }),
      },
      updatedBy: 'lin.dev',
      now: new Date('2026-03-02T00:00:00.000Z'),
    });
    assert.equal(saved.ok, true);
    store.close();

    const again = openApplicationOnlineStore(dbPath);
    stores.push(again);
    const arts = again.getSpecArtifacts('efactory', 'efactory-ap');
    assert.ok(arts);
    assert.match(arts?.dockerfile.content ?? '', /FROM catalog\/img:1/);
    assert.equal(arts?.dockerfile.dirty, false);
    assert.match(arts?.kustomize.base ?? '', /Deployment/);
    assert.equal(arts?.generateFields.port, 8080);
  });

  it('persists Resource Request sheets; empty means not_needed and secrets are omitted', () => {
    const dbPath = tmpDb();
    const store = openApplicationOnlineStore(dbPath);
    stores.push(store);
    assert.equal(store.createProject({ nameSpace: 'efactory' }).ok, true);
    assert.equal(
      store.saveSpecDraft({
        nameSpace: 'efactory',
        appName: 'efactory-ap',
        gitlabUrl: 'https://gitlab.example/efactory.git',
        promotionPath: 'dev→prod',
        templateFamily: 'promote',
        packagingCommand: 'mvn -DskipTests package',
        defaultRef: 'main',
        k8sNamespace: '',
        updatedBy: 'lin.dev',
      }).ok,
      true,
    );
    const saved = store.saveResourceRequests({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      sheets: [
        { kind: 'db', status: 'needed', fields: { type: 'SQLServer', environments: 'QA/Prod' } },
        { kind: 'minio', status: 'not_needed', fields: {} },
        { kind: 'files', status: 'not_needed', fields: {} },
        { kind: 'networks', status: 'not_needed', fields: {} },
        { kind: 'middleware', status: 'not_needed', fields: {} },
        { kind: 'vm', status: 'not_needed', fields: {} },
        { kind: 'domains', status: 'not_needed', fields: {} },
      ],
      updatedBy: 'lin.dev',
      now: new Date('2026-03-03T00:00:00.000Z'),
    });
    assert.equal(saved.ok, true);
    store.close();

    const again = openApplicationOnlineStore(dbPath);
    stores.push(again);
    const loaded = again.getResourceRequests('efactory', 'efactory-ap');
    assert.ok(loaded);
    const db = loaded?.find((s) => s.kind === 'db');
    assert.equal(db?.status, 'needed');
    assert.equal(db?.fields.type, 'SQLServer');
    assert.equal(loaded?.find((s) => s.kind === 'minio')?.status, 'not_needed');
  });

  it('persists Environment Bindings per environment without secret fields', () => {
    const dbPath = tmpDb();
    const store = openApplicationOnlineStore(dbPath);
    stores.push(store);
    assert.equal(store.createProject({ nameSpace: 'efactory' }).ok, true);
    assert.equal(
      store.saveSpecDraft({
        nameSpace: 'efactory',
        appName: 'efactory-ap',
        gitlabUrl: 'https://gitlab.example/efactory.git',
        promotionPath: 'dev→qa→prod',
        templateFamily: 'promote',
        packagingCommand: 'mvn',
        defaultRef: 'main',
        k8sNamespace: '',
        updatedBy: 'ops',
      }).ok,
      true,
    );
    const saved = store.saveEnvironmentBindings({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      bindings: [
        { environment: 'qa', kind: 'db', fields: { host: '192.0.2.9', password: 'nope' } },
        { environment: 'prod', kind: 'db', fields: { host: '192.0.2.14' } },
      ],
      updatedBy: 'ops',
    });
    assert.equal(saved.ok, true);
    if (saved.ok) {
      assert.equal(Object.hasOwn(saved.bindings[0].fields, 'password'), false);
      assert.equal(saved.bindings[0].fields.host, '192.0.2.9');
    }
    store.close();
    const again = openApplicationOnlineStore(dbPath);
    stores.push(again);
    const loaded = again.listEnvironmentBindings('efactory', 'efactory-ap');
    assert.equal(loaded.length, 2);
    assert.equal(loaded.find((b) => b.environment === 'qa')?.fields.host, '192.0.2.9');
    assert.equal(Object.hasOwn(loaded.find((b) => b.environment === 'qa')?.fields ?? {}, 'password'), false);
  });
});
