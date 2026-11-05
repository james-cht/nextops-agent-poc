import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PROMOTION_PATHS,
  TEMPLATE_FAMILIES,
  canEditServiceDeploySpecDraft,
  evaluatePipelineBlock,
  isValidAppName,
  type PipelineBlockInput,
} from './service-deploy-spec.ts';

function block(partial: Partial<PipelineBlockInput> = {}): PipelineBlockInput {
  return {
    nameSpace: 'efactory',
    appName: 'efactory-ap',
    gitlabUrl: 'https://gitlab.example/group/efactory.git',
    promotionPath: 'dev→qa→uat→prod',
    templateFamily: 'promote',
    packagingCommand: 'mvn clean package -DskipTests',
    defaultRef: 'main',
    k8sNamespace: '',
    ...partial,
  };
}

describe('Service Deploy Spec — Pipeline block', () => {
  it('exposes the four Promotion Path catalog entries and two template families', () => {
    assert.deepEqual(PROMOTION_PATHS, [
      'dev→qa→uat→prod',
      'dev→uat→prod',
      'dev→prod',
      'dev→qa→prod',
    ]);
    assert.deepEqual(TEMPLATE_FAMILIES, ['promote', 'web-rebuild']);
  });

  it('rejects APP_NAME with -dev or -prod environment suffixes', () => {
    assert.equal(isValidAppName('efactory-ap'), true);
    assert.equal(isValidAppName('efactory-ap-dev'), false);
    assert.equal(isValidAppName('efactory-ap-prod'), false);
    assert.equal(isValidAppName(''), false);
  });

  it('reports Pipeline-block completeness without requiring Resource Request sheets', () => {
    const complete = evaluatePipelineBlock(block());
    assert.equal(complete.complete, true);
    assert.deepEqual(complete.missing, []);
    assert.equal(complete.ok, true);

    const incomplete = evaluatePipelineBlock(block({ packagingCommand: '  ', defaultRef: '' }));
    assert.equal(incomplete.complete, false);
    assert.ok(incomplete.missing.includes('PACKAGING_COMMAND'));
    assert.ok(incomplete.missing.includes('defaultRef'));

    const badName = evaluatePipelineBlock(block({ appName: 'svc-dev' }));
    assert.equal(badName.ok, false);
    assert.match(badName.error ?? '', /APP_NAME/);

    const badPath = evaluatePipelineBlock(block({ promotionPath: 'dev→staging→prod' as never }));
    assert.equal(badPath.ok, false);
    assert.match(badPath.error ?? '', /Promotion Path/);
  });

  it('keeps K8s namespace optional and distinct from NAME_SPACE', () => {
    const emptyNs = evaluatePipelineBlock(block({ k8sNamespace: '' }));
    assert.equal(emptyNs.ok, true);
    const withNs = evaluatePipelineBlock(block({ k8sNamespace: 'efactory-dev' }));
    assert.equal(withNs.ok, true);
    assert.notEqual(withNs.normalized?.k8sNamespace, withNs.normalized?.nameSpace);
  });

  it('lets Developer with membership and Operator/Owner edit drafts; Viewer cannot', () => {
    assert.equal(
      canEditServiceDeploySpecDraft({
        role: 'application_developer',
        username: 'lin.dev',
        nameSpace: 'efactory',
        memberships: [{ nameSpace: 'efactory', username: 'lin.dev' }],
      }),
      true,
    );
    assert.equal(
      canEditServiceDeploySpecDraft({
        role: 'application_developer',
        username: 'lin.dev',
        nameSpace: 'other',
        memberships: [{ nameSpace: 'efactory', username: 'lin.dev' }],
      }),
      false,
    );
    assert.equal(
      canEditServiceDeploySpecDraft({
        role: 'operator',
        username: 'ops',
        nameSpace: 'efactory',
        memberships: [],
      }),
      true,
    );
    assert.equal(
      canEditServiceDeploySpecDraft({
        role: 'viewer',
        username: 'watch',
        nameSpace: 'efactory',
        memberships: [],
      }),
      false,
    );
  });
});
