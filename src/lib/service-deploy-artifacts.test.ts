import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_BASE_IMAGES,
  dockerfileFieldsFingerprint,
  environmentsForPromotionPath,
  extractDockerfileFrom,
  generateDockerfile,
  generateKustomizeBundle,
  resolveDockerfilePreview,
  type DockerfileGenerateFields,
} from './service-deploy-artifacts.ts';

const fields = (partial: Partial<DockerfileGenerateFields> = {}): DockerfileGenerateFields => ({
  baseImage: DEFAULT_BASE_IMAGES[0],
  artifactPath: 'target/*.jar',
  workdir: '/app',
  entrypoint: '["java","-jar","/app/app.jar"]',
  port: 8080,
  packagingCommand: 'mvn clean package -DskipTests',
  ...partial,
});

describe('Service Deploy Spec — Dockerfile / Kustomize artifacts', () => {
  it('maps Promotion Path to overlay environment keys', () => {
    assert.deepEqual(environmentsForPromotionPath('dev→qa→uat→prod'), ['dev', 'qa', 'uat', 'prod']);
    assert.deepEqual(environmentsForPromotionPath('dev→uat→prod'), ['dev', 'uat', 'prod']);
    assert.deepEqual(environmentsForPromotionPath('dev→prod'), ['dev', 'prod']);
    assert.deepEqual(environmentsForPromotionPath('dev→qa→prod'), ['dev', 'qa', 'prod']);
  });

  it('generates a Dockerfile from fields without embedding PACKAGING_COMMAND', () => {
    const text = generateDockerfile(fields());
    assert.match(text, /^FROM /m);
    assert.match(text, new RegExp(`FROM ${DEFAULT_BASE_IMAGES[0]}`));
    assert.match(text, /WORKDIR \/app/);
    assert.match(text, /ADD target\/\*\.jar/);
    assert.match(text, /EXPOSE 8080/);
    assert.match(text, /ENTRYPOINT/);
    assert.doesNotMatch(text, /mvn/);
    assert.doesNotMatch(text, /PACKAGING_COMMAND/);
  });

  it('rejects off-catalog FROM unless the Dockerfile is already 已手工調整', () => {
    const clean = resolveDockerfilePreview({
      fields: fields({ baseImage: 'evil.example/not-allowed:1' }),
      previous: null,
    });
    assert.equal(clean.ok, false);
    if (!clean.ok) assert.equal(clean.code, 'BAD_REQUEST');

    const dirtyKeep = resolveDockerfilePreview({
      fields: fields({ baseImage: DEFAULT_BASE_IMAGES[0] }),
      previous: {
        content: 'FROM evil.example/not-allowed:1\nWORKDIR /app\n',
        dirty: true,
        fieldsFingerprint: dockerfileFieldsFingerprint(fields()),
      },
      choice: 'keep-manual',
    });
    assert.equal(dirtyKeep.ok, true);
    if (dirtyKeep.ok) {
      assert.equal(dirtyKeep.preview.dirty, true);
      assert.equal(dirtyKeep.preview.offCatalogFromWarning, true);
      assert.equal(extractDockerfileFrom(dirtyKeep.preview.content), 'evil.example/not-allowed:1');
    }
  });

  it('requires regenerate vs keep-manual when dirty and generating fields change', () => {
    const previousFields = fields({ port: 8080 });
    const previous = {
      content: 'FROM scratch\n# hand edit\n',
      dirty: true,
      fieldsFingerprint: dockerfileFieldsFingerprint(previousFields),
    };
    const changed = fields({ port: 9090 });
    const blocked = resolveDockerfilePreview({
      fields: changed,
      previous,
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.code, 'NEEDS_CHOICE');

    const regen = resolveDockerfilePreview({
      fields: changed,
      previous,
      choice: 'regenerate',
    });
    assert.equal(regen.ok, true);
    if (regen.ok) {
      assert.equal(regen.preview.dirty, false);
      assert.match(regen.preview.content, /EXPOSE 9090/);
      assert.doesNotMatch(regen.preview.content, /hand edit/);
    }

    const keep = resolveDockerfilePreview({
      fields: changed,
      previous,
      choice: 'keep-manual',
    });
    assert.equal(keep.ok, true);
    if (keep.ok) {
      assert.equal(keep.preview.dirty, true);
      assert.match(keep.preview.content, /hand edit/);
    }
  });

  it('generates Kustomize base plus overlays for Promotion Path envs with runtime env in overlay', () => {
    const bundle = generateKustomizeBundle({
      appName: 'efactory-ap',
      port: 8080,
      replicas: 2,
      cpu: '500m',
      memory: '1Gi',
      runtimeEnv: { SPRING_PROFILES_ACTIVE: 'dev' },
      environments: ['dev', 'qa', 'prod'],
    });
    assert.match(bundle.base, /kind: Deployment/);
    assert.match(bundle.base, /efactory-ap/);
    assert.match(bundle.overlays.dev, /count: 2/);
    assert.match(bundle.overlays.dev, /SPRING_PROFILES_ACTIVE/);
    assert.match(bundle.overlays.dev, /500m/);
    assert.match(bundle.overlays.qa, /kind: ConfigMap|SPRING_PROFILES_ACTIVE/);
    assert.ok(bundle.overlays.prod);
  });
});
