export type MrFile = { path: string; content: string };

export function buildCentralPipelineMrFiles(opts: {
  nameSpace: string;
  appName: string;
  dockerfile: string;
  pipelineParamsYaml: string;
  kustomizeBase: string;
  overlays: Record<string, string>;
}): MrFile[] {
  const root = `deploy/${opts.nameSpace}/${opts.appName}`;
  const files: MrFile[] = [
    { path: `${root}/Dockerfile`, content: opts.dockerfile },
    { path: `${root}/pipeline-params.yaml`, content: opts.pipelineParamsYaml },
    { path: `${root}/deploy-yaml/base/deployment.yaml`, content: opts.kustomizeBase },
  ];
  for (const [env, content] of Object.entries(opts.overlays)) {
    files.push({
      path: `${root}/deploy-yaml/overlays/${env}/kustomization.yaml`,
      content,
    });
  }
  return files;
}

const SECRET_CONTENT_RE =
  /(password\s*[:=]|passwd\s*[:=]|kubeconfig\s*[:=]|api[_-]?token\s*[:=]|private[_-]?key\s*[:=]|-----BEGIN (RSA |OPENSSH )?PRIVATE KEY-----)/i;

export function mrPayloadContainsSecrets(files: MrFile[]): boolean {
  return files.some((f) => SECRET_CONTENT_RE.test(f.content) || SECRET_CONTENT_RE.test(f.path));
}

export function buildPipelineParamsYaml(opts: {
  nameSpace: string;
  appName: string;
  gitlabUrl: string;
  promotionPath: string;
  templateFamily: string;
  packagingCommand: string;
  defaultRef: string;
}): string {
  return [
    `NAME_SPACE: ${opts.nameSpace}`,
    `APP_NAME: ${opts.appName}`,
    `GITLAB_URL: ${opts.gitlabUrl}`,
    `PROMOTION_PATH: ${opts.promotionPath}`,
    `TEMPLATE_FAMILY: ${opts.templateFamily}`,
    `PACKAGING_COMMAND: ${opts.packagingCommand}`,
    `DEFAULT_REF: ${opts.defaultRef}`,
    '',
  ].join('\n');
}

export function prepareSpecSubmitArtifacts(opts: {
  dockerfile: { content: string; dirty: boolean; fieldsFingerprint: string };
  kustomize: {
    base: string;
    overlaysJson: string;
    dirty: boolean;
    fieldsFingerprint: string;
  };
  dockerFieldsChanged: boolean;
  kustomizeFieldsChanged?: boolean;
  dockerfileChoice?: 'regenerate' | 'keep-manual';
  kustomizeChoice?: 'regenerate' | 'keep-manual';
  regeneratedDockerfile: string;
  regeneratedKustomize?: { base: string; overlaysJson: string };
}):
  | {
      ok: true;
      dockerfileContent: string;
      kustomizeBase: string;
      overlays: Record<string, string>;
    }
  | { ok: false; code: 'NEEDS_CHOICE' | 'BAD_REQUEST'; error: string } {
  let dockerfileContent = opts.dockerfile.content;
  if (opts.dockerfile.dirty && opts.dockerFieldsChanged) {
    if (!opts.dockerfileChoice) {
      return {
        ok: false,
        code: 'NEEDS_CHOICE',
        error: 'Dockerfile is 已手工調整; choose regenerate or keep-manual before submit',
      };
    }
    dockerfileContent =
      opts.dockerfileChoice === 'regenerate'
        ? opts.regeneratedDockerfile
        : opts.dockerfile.content;
  } else if (!opts.dockerfile.dirty) {
    dockerfileContent = opts.regeneratedDockerfile || opts.dockerfile.content;
  }

  let kustomizeBase = opts.kustomize.base;
  let overlaysJson = opts.kustomize.overlaysJson;
  if (opts.kustomize.dirty && opts.kustomizeFieldsChanged) {
    if (!opts.kustomizeChoice) {
      return {
        ok: false,
        code: 'NEEDS_CHOICE',
        error: 'Kustomize is 已手工調整; choose regenerate or keep-manual before submit',
      };
    }
    if (opts.kustomizeChoice === 'regenerate' && opts.regeneratedKustomize) {
      kustomizeBase = opts.regeneratedKustomize.base;
      overlaysJson = opts.regeneratedKustomize.overlaysJson;
    }
  } else if (!opts.kustomize.dirty && opts.regeneratedKustomize) {
    kustomizeBase = opts.regeneratedKustomize.base;
    overlaysJson = opts.regeneratedKustomize.overlaysJson;
  }

  let overlays: Record<string, string>;
  try {
    overlays = JSON.parse(overlaysJson) as Record<string, string>;
  } catch {
    return { ok: false, code: 'BAD_REQUEST', error: 'Invalid Kustomize overlays JSON' };
  }

  return {
    ok: true,
    dockerfileContent,
    kustomizeBase,
    overlays,
  };
}
