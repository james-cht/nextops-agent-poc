import type { PromotionPath } from './service-deploy-spec.ts';

/** Fixture catalog for this slice; later replaced by central-repo base-images.yaml. */
export const DEFAULT_BASE_IMAGES = [
  '192.0.2.6:30002/base/rockylinux8-openjdk21:2025-01',
  '192.0.2.6:30002/base/rockylinux8-nodejs20:2025-01',
] as const;

export function environmentsForPromotionPath(path: PromotionPath): string[] {
  switch (path) {
    case 'dev→qa→uat→prod':
      return ['dev', 'qa', 'uat', 'prod'];
    case 'dev→uat→prod':
      return ['dev', 'uat', 'prod'];
    case 'dev→prod':
      return ['dev', 'prod'];
    case 'dev→qa→prod':
      return ['dev', 'qa', 'prod'];
  }
}

export type DockerfileGenerateFields = {
  baseImage: string;
  artifactPath: string;
  workdir: string;
  entrypoint: string;
  port: number;
  /** Durable Spec field — must never be written into the Dockerfile. */
  packagingCommand: string;
};

export type DockerfilePreview = {
  content: string;
  dirty: boolean;
  fieldsFingerprint: string;
  offCatalogFromWarning: boolean;
};

export type ArtifactResolveFail = {
  ok: false;
  code: 'BAD_REQUEST' | 'NEEDS_CHOICE';
  error: string;
};

export function dockerfileFieldsFingerprint(fields: DockerfileGenerateFields): string {
  return [
    fields.baseImage.trim(),
    fields.artifactPath.trim(),
    fields.workdir.trim(),
    fields.entrypoint.trim(),
    String(fields.port),
  ].join('\0');
}

export function extractDockerfileFrom(content: string): string | null {
  const match = content.match(/^\s*FROM\s+(\S+)/m);
  return match?.[1] ?? null;
}

export function generateDockerfile(fields: DockerfileGenerateFields): string {
  const baseImage = fields.baseImage.trim();
  const workdir = fields.workdir.trim() || '/app';
  const artifactPath = fields.artifactPath.trim() || 'target/*.jar';
  const entrypoint = fields.entrypoint.trim() || '["java","-jar","/app/app.jar"]';
  const port = Number.isFinite(fields.port) ? fields.port : 8080;
  return [
    `FROM ${baseImage}`,
    `WORKDIR ${workdir}`,
    `ADD ${artifactPath} ${workdir}/app.jar`,
    `EXPOSE ${port}`,
    `ENTRYPOINT ${entrypoint}`,
    '',
  ].join('\n');
}

function fromIsAllowed(from: string, catalog: readonly string[]): boolean {
  return catalog.includes(from);
}

export function resolveDockerfilePreview(opts: {
  fields: DockerfileGenerateFields;
  previous: { content: string; dirty: boolean; fieldsFingerprint: string } | null;
  choice?: 'regenerate' | 'keep-manual';
  catalog?: readonly string[];
  /** When set, marks the preview 已手工調整 (hand edit of content). */
  handEditedContent?: string;
}): { ok: true; preview: DockerfilePreview } | ArtifactResolveFail {
  const catalog = opts.catalog ?? DEFAULT_BASE_IMAGES;
  const fingerprint = dockerfileFieldsFingerprint(opts.fields);
  const previous = opts.previous;

  if (opts.handEditedContent !== undefined) {
    const from = extractDockerfileFrom(opts.handEditedContent);
    if (!from) {
      return { ok: false, code: 'BAD_REQUEST', error: 'Dockerfile must include a FROM line' };
    }
    const offCatalog = !fromIsAllowed(from, catalog);
    return {
      ok: true,
      preview: {
        content: opts.handEditedContent,
        dirty: true,
        fieldsFingerprint: fingerprint,
        offCatalogFromWarning: offCatalog,
      },
    };
  }

  if (previous?.dirty) {
    const fieldsChanged = previous.fieldsFingerprint !== fingerprint;
    if (fieldsChanged && !opts.choice) {
      return {
        ok: false,
        code: 'NEEDS_CHOICE',
        error: 'Dockerfile is 已手工調整; choose regenerate or keep-manual',
      };
    }
    if (opts.choice === 'keep-manual' || (previous.dirty && !fieldsChanged && !opts.choice)) {
      const from = extractDockerfileFrom(previous.content);
      const offCatalog = from ? !fromIsAllowed(from, catalog) : false;
      return {
        ok: true,
        preview: {
          content: previous.content,
          dirty: true,
          fieldsFingerprint: fingerprint,
          offCatalogFromWarning: offCatalog,
        },
      };
    }
    // regenerate falls through
  }

  const baseImage = opts.fields.baseImage.trim();
  if (!fromIsAllowed(baseImage, catalog)) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: 'FROM must come from the published base-images catalog',
    };
  }

  const content = generateDockerfile(opts.fields);
  return {
    ok: true,
    preview: {
      content,
      dirty: false,
      fieldsFingerprint: fingerprint,
      offCatalogFromWarning: false,
    },
  };
}

export type KustomizeGenerateFields = {
  appName: string;
  port: number;
  replicas: number;
  cpu: string;
  memory: string;
  runtimeEnv: Record<string, string>;
  environments: string[];
};

export type KustomizeBundle = {
  base: string;
  overlays: Record<string, string>;
};

export function generateKustomizeBundle(fields: KustomizeGenerateFields): KustomizeBundle {
  const appName = fields.appName.trim();
  const port = fields.port;
  const base = [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    `  name: ${appName}`,
    'spec:',
    '  template:',
    '    spec:',
    '      containers:',
    `        - name: ${appName}`,
    `          ports:`,
    `            - containerPort: ${port}`,
    '',
  ].join('\n');

  const envLines = Object.entries(fields.runtimeEnv)
    .map(([k, v]) => `  ${k}: "${v}"`)
    .join('\n');

  const overlays: Record<string, string> = {};
  for (const env of fields.environments) {
    overlays[env] = [
      `apiVersion: kustomize.config.k8s.io/v1beta1`,
      `kind: Kustomization`,
      `resources:`,
      `  - ../../base`,
      `replicas:`,
      `  - name: ${appName}`,
      `    count: ${fields.replicas}`,
      `patches:`,
      `  - target:`,
      `      kind: Deployment`,
      `      name: ${appName}`,
      `    patch: |-`,
      `      - op: replace`,
      `        path: /spec/template/spec/containers/0/resources`,
      `        value:`,
      `          requests:`,
      `            cpu: ${fields.cpu}`,
      `            memory: ${fields.memory}`,
      `---`,
      `apiVersion: v1`,
      `kind: ConfigMap`,
      `metadata:`,
      `  name: ${appName}-env`,
      `data:`,
      envLines || `  ENV: "${env}"`,
      '',
    ].join('\n');
  }

  return { base, overlays };
}

export function kustomizeFieldsFingerprint(fields: {
  appName: string;
  port: number;
  replicas: number;
  cpu: string;
  memory: string;
  runtimeEnv: Record<string, string>;
  environments: string[];
}): string {
  return [
    fields.appName.trim(),
    String(fields.port),
    String(fields.replicas),
    fields.cpu.trim(),
    fields.memory.trim(),
    JSON.stringify(fields.runtimeEnv),
    fields.environments.join(','),
  ].join('\0');
}

export function resolveKustomizePreview(opts: {
  fields: KustomizeGenerateFields;
  previous: { base: string; overlaysJson: string; dirty: boolean; fieldsFingerprint: string } | null;
  choice?: 'regenerate' | 'keep-manual';
}):
  | {
      ok: true;
      preview: {
        base: string;
        overlaysJson: string;
        dirty: boolean;
        fieldsFingerprint: string;
      };
    }
  | ArtifactResolveFail {
  const fingerprint = kustomizeFieldsFingerprint(opts.fields);
  const previous = opts.previous;
  if (previous?.dirty) {
    const fieldsChanged = previous.fieldsFingerprint !== fingerprint;
    if (fieldsChanged && !opts.choice) {
      return {
        ok: false,
        code: 'NEEDS_CHOICE',
        error: 'Kustomize is 已手工調整; choose regenerate or keep-manual',
      };
    }
    if (opts.choice === 'keep-manual' || (!fieldsChanged && !opts.choice)) {
      return {
        ok: true,
        preview: {
          base: previous.base,
          overlaysJson: previous.overlaysJson,
          dirty: true,
          fieldsFingerprint: fingerprint,
        },
      };
    }
  }
  const bundle = generateKustomizeBundle(opts.fields);
  return {
    ok: true,
    preview: {
      base: bundle.base,
      overlaysJson: JSON.stringify(bundle.overlays),
      dirty: false,
      fieldsFingerprint: fingerprint,
    },
  };
}
