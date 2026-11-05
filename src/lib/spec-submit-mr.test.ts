import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCentralPipelineMrFiles,
  mrPayloadContainsSecrets,
  prepareSpecSubmitArtifacts,
} from './spec-submit-mr.ts';

describe('Service Deploy Spec — submit central GitLab MR', () => {
  it('builds MR paths under deploy/<NAME_SPACE>/<APP_NAME>/ without copying Jenkinsfiles', () => {
    const files = buildCentralPipelineMrFiles({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      dockerfile: 'FROM catalog/img:1\nWORKDIR /app\n',
      pipelineParamsYaml: 'NAME_SPACE: efactory\nAPP_NAME: efactory-ap\n',
      kustomizeBase: 'kind: Deployment\n',
      overlays: { dev: 'replicas: 1\n', prod: 'replicas: 2\n' },
    });
    const paths = files.map((f) => f.path);
    assert.ok(paths.includes('deploy/efactory/efactory-ap/Dockerfile'));
    assert.ok(paths.includes('deploy/efactory/efactory-ap/pipeline-params.yaml'));
    assert.ok(paths.includes('deploy/efactory/efactory-ap/deploy-yaml/base/deployment.yaml'));
    assert.ok(paths.includes('deploy/efactory/efactory-ap/deploy-yaml/overlays/dev/kustomization.yaml'));
    assert.ok(paths.includes('deploy/efactory/efactory-ap/deploy-yaml/overlays/prod/kustomization.yaml'));
    assert.equal(
      paths.some((p) => /Jenkinsfile/i.test(p)),
      false,
    );
  });

  it('rejects payloads that contain kubeconfig, tokens, or passwords', () => {
    assert.equal(mrPayloadContainsSecrets([{ path: 'a', content: 'password: s3cret' }]), true);
    assert.equal(mrPayloadContainsSecrets([{ path: 'a', content: 'kubeconfig: ---' }]), true);
    assert.equal(mrPayloadContainsSecrets([{ path: 'a', content: 'api_token: abc' }]), true);
    assert.equal(
      mrPayloadContainsSecrets([{ path: 'a', content: 'FROM catalog\nEXPOSE 8080\n' }]),
      false,
    );
  });

  it('applies dirty-flag regenerate vs keep-manual before MR files are written', () => {
    const blocked = prepareSpecSubmitArtifacts({
      dockerfile: {
        content: 'FROM scratch\n# hand\n',
        dirty: true,
        fieldsFingerprint: 'old',
      },
      kustomize: {
        base: 'kind: Deployment\n',
        overlaysJson: JSON.stringify({ dev: 'x\n' }),
        dirty: false,
        fieldsFingerprint: 'k',
      },
      dockerFieldsChanged: true,
      dockerfileChoice: undefined,
      regeneratedDockerfile: 'FROM catalog\nWORKDIR /app\n',
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.code, 'NEEDS_CHOICE');

    const regen = prepareSpecSubmitArtifacts({
      dockerfile: {
        content: 'FROM scratch\n# hand\n',
        dirty: true,
        fieldsFingerprint: 'old',
      },
      kustomize: {
        base: 'kind: Deployment\n',
        overlaysJson: JSON.stringify({ dev: 'x\n' }),
        dirty: false,
        fieldsFingerprint: 'k',
      },
      dockerFieldsChanged: true,
      dockerfileChoice: 'regenerate',
      regeneratedDockerfile: 'FROM catalog\nWORKDIR /app\n',
    });
    assert.equal(regen.ok, true);
    if (regen.ok) {
      assert.match(regen.dockerfileContent, /FROM catalog/);
      assert.doesNotMatch(regen.dockerfileContent, /hand/);
    }

    const keep = prepareSpecSubmitArtifacts({
      dockerfile: {
        content: 'FROM scratch\n# hand\n',
        dirty: true,
        fieldsFingerprint: 'old',
      },
      kustomize: {
        base: 'kind: Deployment\n',
        overlaysJson: JSON.stringify({ dev: 'x\n' }),
        dirty: false,
        fieldsFingerprint: 'k',
      },
      dockerFieldsChanged: true,
      dockerfileChoice: 'keep-manual',
      regeneratedDockerfile: 'FROM catalog\nWORKDIR /app\n',
    });
    assert.equal(keep.ok, true);
    if (keep.ok) assert.match(keep.dockerfileContent, /hand/);
  });
});
