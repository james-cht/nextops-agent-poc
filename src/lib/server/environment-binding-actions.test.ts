import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  listApplicationOnlineHome,
  saveServiceDeployEnvironmentBindings,
  evaluateServiceDeployQaBindingGate,
  triggerDevValidate,
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
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-binding-'));
  dirs.push(d);
  const store = openApplicationOnlineStore(path.join(d, 'application-online.sqlite'));
  stores.push(store);
  return store;
}

function account(role: OperatorRole, username = 'ops') {
  return { username, role, disabled: false };
}

describe('Environment Binding actions and QA gate', () => {
  it('Operator saves Binding; Developer cannot; Config Check appears on home; QA gate blocks; Dev still runs', async () => {
    const store = openStore();
    store.createProject({ nameSpace: 'efactory' });
    store.addMembership({ nameSpace: 'efactory', username: 'lin.dev' });
    assert.equal(
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
    store.saveSpecArtifacts({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      dockerfile: {
        content: 'FROM unofficial/base:1\n',
        dirty: true,
        fieldsFingerprint: 'fp',
        offCatalogFromWarning: true,
      },
      kustomize: {
        base: 'apiVersion: apps/v1\nkind: Deployment\n',
        overlaysJson: '{}',
        dirty: false,
        fieldsFingerprint: 'fp',
      },
      generateFields: {
        baseImage: 'unofficial/base:1',
        artifactPath: 'target/*.jar',
        workdir: '/app',
        entrypoint: '["java","-jar","/app/app.jar"]',
        port: 8080,
        replicas: 1,
        cpu: '500m',
        memory: '1Gi',
        runtimeEnvJson: '{}',
      },
      updatedBy: 'ops',
    });
    assert.equal(
      store.recordPublishedDevJob({
        nameSpace: 'efactory',
        appName: 'efactory-ap',
        publishedPinSha: 'sha1',
        devJobId: 'job-dev',
      }).ok,
      true,
    );

    const denied = saveServiceDeployEnvironmentBindings({
      store,
      account: account('application_developer', 'lin.dev'),
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      bindings: [{ environment: 'qa', kind: 'db', fields: { host: 'qa-db' } }],
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, 'FORBIDDEN');

    const saved = saveServiceDeployEnvironmentBindings({
      store,
      account: account('operator', 'ops'),
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      bindings: [
        { environment: 'qa', kind: 'db', fields: { host: 'qa-db', password: 'x' } },
      ],
    });
    assert.equal(saved.ok, true);
    if (saved.ok) {
      assert.equal(Object.hasOwn(saved.bindings[0].fields, 'password'), false);
    }

    const gate = evaluateServiceDeployQaBindingGate({
      store,
      nameSpace: 'efactory',
      appName: 'efactory-ap',
    });
    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.ok(gate.missing.some((m) => m.environment === 'prod' && m.kind === 'db'));
    }

    const home = listApplicationOnlineHome({
      store,
      account: account('operator', 'ops'),
      developerAccounts: [],
    });
    const draft = home.projects[0]?.drafts[0];
    assert.ok(draft?.configCheck);
    assert.equal(draft?.configCheck.blocksQaRelease, true);
    assert.equal(draft?.configCheck.blocksDevValidate, false);
    assert.ok(draft?.configCheck.items.some((i) => i.level === 'warn' && /FROM/i.test(i.message)));
    assert.ok(draft?.environmentBindings.some((b) => b.environment === 'qa'));

    const jenkins = {
      async enqueueDevValidate() {
        return { ok: true as const, runId: 'run-1', status: 'queued' };
      },
      async getDevRunStatus() {
        return { ok: true as const, runId: 'run-1', status: 'success_apply' };
      },
    };
    const triggered = await triggerDevValidate({
      store,
      account: account('operator', 'ops'),
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      jenkins,
    });
    assert.equal(triggered.ok, true);
  });
});
