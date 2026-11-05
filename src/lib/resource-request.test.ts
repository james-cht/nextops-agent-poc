import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluatePipelineBlock, type PipelineBlockInput } from './service-deploy-spec.ts';
import {
  RESOURCE_REQUEST_KINDS,
  normalizeResourceRequestSheets,
  resourceRequestStatus,
  stripSecretFields,
} from './resource-request.ts';

function block(): PipelineBlockInput {
  return {
    nameSpace: 'efactory',
    appName: 'efactory-ap',
    gitlabUrl: 'https://gitlab.example/group/efactory.git',
    promotionPath: 'dev→qa→uat→prod',
    templateFamily: 'promote',
    packagingCommand: 'mvn clean package -DskipTests',
    defaultRef: 'main',
    k8sNamespace: '',
  };
}

describe('Service Deploy Spec — Resource Request sheets', () => {
  it('lists optional Resource Request kinds from the collection form', () => {
    assert.deepEqual(RESOURCE_REQUEST_KINDS, [
      'files',
      'networks',
      'middleware',
      'vm',
      'db',
      'minio',
      'domains',
    ]);
  });

  it('does not fail Pipeline-block completeness when Resource Requests are empty', () => {
    const pipeline = evaluatePipelineBlock(block());
    assert.equal(pipeline.complete, true);
    const sheets = normalizeResourceRequestSheets([]);
    assert.equal(sheets.every((s) => s.status === 'not_needed'), true);
  });

  it('persists empty sections as not_needed, not as incomplete required blocks', () => {
    const sheets = normalizeResourceRequestSheets([
      { kind: 'db', fields: { type: 'SQLServer', environments: 'QA/Prod' } },
      { kind: 'minio', fields: {} },
    ]);
    assert.equal(resourceRequestStatus(sheets.find((s) => s.kind === 'db')!), 'needed');
    assert.equal(resourceRequestStatus(sheets.find((s) => s.kind === 'minio')!), 'not_needed');
    assert.equal(resourceRequestStatus(sheets.find((s) => s.kind === 'vm')!), 'not_needed');
  });

  it('omits password-like fields so they are not stored for Git publish', () => {
    const cleaned = stripSecretFields({
      type: 'SQLServer',
      password: 's3cret',
      dbPassword: 'x',
      kubeconfig: '---',
      host: 'db.example',
      apiToken: 'tok',
    });
    assert.deepEqual(cleaned, { type: 'SQLServer', host: 'db.example' });
    assert.equal(Object.hasOwn(cleaned, 'password'), false);
  });
});
