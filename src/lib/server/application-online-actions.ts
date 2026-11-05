import type { OperatorRole } from '../operator-role.ts';
import {
  canAddAsProjectMember,
  canManageProjectMembership,
  projectsVisibleFor,
  type ProjectMembershipRecord,
  type ProjectRecord,
} from '../application-online-membership.ts';
import {
  canEditServiceDeploySpecDraft,
  evaluatePipelineBlock,
  type PipelineBlockInput,
} from '../service-deploy-spec.ts';
import {
  DEFAULT_BASE_IMAGES,
  environmentsForPromotionPath,
  resolveDockerfilePreview,
  resolveKustomizePreview,
} from '../service-deploy-artifacts.ts';
import {
  authorizeIdpCallbackToken,
  parseRuntimeCheckPayload,
} from '../idp-runtime-check.ts';
import {
  buildDevValidateEnqueue,
  canTriggerDevValidate,
} from '../spec-dev-validate.ts';
import {
  buildDevKubeSphereJobCreate,
  canRecordPublishedPin,
} from '../spec-dev-publish.ts';
import {
  buildCentralPipelineMrFiles,
  buildPipelineParamsYaml,
  mrPayloadContainsSecrets,
  prepareSpecSubmitArtifacts,
} from '../spec-submit-mr.ts';
import {
  canInvokeBreakGlass,
  recordBreakGlassSkip,
  type BreakGlassEntry,
  type BreakGlassRule,
} from '../break-glass.ts';
import {
  buildProdPromoteJob,
  buildProdSiteJob,
} from '../prod-promote.ts';
import {
  buildHopJobCreate,
  canReleaseNextHop,
  previousHop,
  resolveSourceImage,
} from '../promotion-ladder.ts';
import {
  canRecordEnvironmentBinding,
  computeConfigCheck,
  evaluateQaBindingGate,
  normalizeEnvironmentBindings,
  type ConfigCheckResult,
  type EnvironmentBinding,
  type EnvironmentBindingInput,
  type BindingMissing,
} from '../environment-binding.ts';
import {
  normalizeResourceRequestSheets,
  type ResourceRequestSheet,
  type ResourceRequestSheetInput,
} from '../resource-request.ts';
import type {
  ApplicationOnlineStore,
  EnvironmentPinRecord,
  ServiceDeploySpecDraftRecord,
  SpecArtifactsRecord,
} from './application-online-store.ts';

export type ActorAccount = {
  username: string;
  role: OperatorRole;
  disabled: boolean;
};

export type ActionFail = {
  ok: false;
  code: 'FORBIDDEN' | 'BAD_REQUEST' | 'CONFLICT' | 'NOT_FOUND' | 'NEEDS_CHOICE';
  error: string;
};

export type ApplicationOnlineHome = {
  projects: Array<
    ProjectRecord & {
      members: ProjectMembershipRecord[];
      drafts: Array<
        ServiceDeploySpecDraftRecord & {
          artifacts: SpecArtifactsRecord | null;
          resourceRequests: ResourceRequestSheet[];
          environmentBindings: EnvironmentBinding[];
          configCheck: ConfigCheckResult;
          environmentPins: EnvironmentPinRecord[];
        }
      >;
      breakGlassHistory: BreakGlassEntry[];
      canEditSpec: boolean;
      canTriggerDevValidate: boolean;
      canRecordBinding: boolean;
    }
  >;
  canManageMembership: boolean;
  developerCandidates: Array<{ username: string }>;
  baseImages: readonly string[];
};

export function listApplicationOnlineHome(opts: {
  store: ApplicationOnlineStore;
  account: ActorAccount;
  developerAccounts: ActorAccount[];
}): ApplicationOnlineHome {
  const allProjects = opts.store.listProjects();
  const allMemberships = opts.store.listAllMemberships();
  const visible = projectsVisibleFor({
    role: opts.account.role,
    username: opts.account.username,
    projects: allProjects,
    memberships: allMemberships,
  });
  const canManage = canManageProjectMembership(opts.account.role);
  const canBind = canRecordEnvironmentBinding(opts.account.role);
  return {
    projects: visible.map((project) => ({
      ...project,
      members: allMemberships.filter((m) => m.nameSpace === project.nameSpace),
      breakGlassHistory: opts.store.listBreakGlass(project.nameSpace),
      drafts: opts.store.listSpecDrafts(project.nameSpace).map((draft) => {
        const artifacts = opts.store.getSpecArtifacts(draft.nameSpace, draft.appName);
        const resourceRequests =
          opts.store.getResourceRequests(draft.nameSpace, draft.appName) ??
          normalizeResourceRequestSheets([]);
        const environmentBindings = opts.store.listEnvironmentBindings(
          draft.nameSpace,
          draft.appName,
        );
        return {
          ...draft,
          artifacts,
          resourceRequests,
          environmentBindings,
          environmentPins: opts.store.listEnvironmentPins(draft.nameSpace, draft.appName),
          configCheck: computeConfigCheck({
            promotionPath: draft.promotionPath,
            sheets: resourceRequests,
            bindings: environmentBindings,
            offCatalogFromWarning: artifacts?.dockerfile.offCatalogFromWarning === true,
          }),
        };
      }),
      canEditSpec: canEditServiceDeploySpecDraft({
        role: opts.account.role,
        username: opts.account.username,
        nameSpace: project.nameSpace,
        memberships: allMemberships,
      }),
      canTriggerDevValidate: canTriggerDevValidate({
        role: opts.account.role,
        username: opts.account.username,
        nameSpace: project.nameSpace,
        memberships: allMemberships,
      }),
      canRecordBinding: canBind,
    })),
    canManageMembership: canManage,
    developerCandidates: canManage
      ? opts.developerAccounts
          .filter((a) => canAddAsProjectMember(a))
          .map((a) => ({ username: a.username }))
      : [],
    baseImages: DEFAULT_BASE_IMAGES,
  };
}

export function createApplicationOnlineProject(opts: {
  store: ApplicationOnlineStore;
  account: ActorAccount;
  nameSpace: string;
}): { ok: true; project: ProjectRecord } | ActionFail {
  if (!canManageProjectMembership(opts.account.role) || opts.account.disabled) {
    return { ok: false, code: 'FORBIDDEN', error: 'Operator or Platform Owner required' };
  }
  const result = opts.store.createProject({ nameSpace: opts.nameSpace });
  if (!result.ok) return result;
  return { ok: true, project: result.project };
}

export function addProjectMembership(opts: {
  store: ApplicationOnlineStore;
  account: ActorAccount;
  nameSpace: string;
  username: string;
  targetAccount: ActorAccount | null;
}): { ok: true } | ActionFail {
  if (!canManageProjectMembership(opts.account.role) || opts.account.disabled) {
    return { ok: false, code: 'FORBIDDEN', error: 'Operator or Platform Owner required' };
  }
  if (!canAddAsProjectMember(opts.targetAccount)) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: 'Membership requires an existing enabled Application Developer',
    };
  }
  return opts.store.addMembership({ nameSpace: opts.nameSpace, username: opts.username });
}

export function removeProjectMembership(opts: {
  store: ApplicationOnlineStore;
  account: ActorAccount;
  nameSpace: string;
  username: string;
}): { ok: true } | ActionFail {
  if (!canManageProjectMembership(opts.account.role) || opts.account.disabled) {
    return { ok: false, code: 'FORBIDDEN', error: 'Operator or Platform Owner required' };
  }
  return opts.store.removeMembership({ nameSpace: opts.nameSpace, username: opts.username });
}

export function saveServiceDeploySpecDraft(opts: {
  store: ApplicationOnlineStore;
  account: ActorAccount;
  input: PipelineBlockInput;
}):
  | { ok: true; draft: ServiceDeploySpecDraftRecord; pipelineBlockComplete: boolean }
  | ActionFail {
  if (opts.account.disabled) {
    return { ok: false, code: 'FORBIDDEN', error: 'Account disabled' };
  }
  const memberships = opts.store.listAllMemberships();
  if (
    !canEditServiceDeploySpecDraft({
      role: opts.account.role,
      username: opts.account.username,
      nameSpace: opts.input.nameSpace.trim().toLowerCase(),
      memberships,
    })
  ) {
    return { ok: false, code: 'FORBIDDEN', error: 'Cannot edit Service Deploy Spec draft' };
  }
  const evaluated = evaluatePipelineBlock(opts.input);
  if (!evaluated.ok || !evaluated.normalized) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: evaluated.error ?? 'Invalid Pipeline block',
    };
  }
  const saved = opts.store.saveSpecDraft({
    ...evaluated.normalized,
    updatedBy: opts.account.username,
  });
  if (!saved.ok) return saved;
  return {
    ok: true,
    draft: saved.draft,
    pipelineBlockComplete: evaluated.complete,
  };
}

export function saveServiceDeploySpecArtifacts(opts: {
  store: ApplicationOnlineStore;
  account: ActorAccount;
  nameSpace: string;
  appName: string;
  generate: {
    baseImage: string;
    artifactPath: string;
    workdir: string;
    entrypoint: string;
    port: number;
    replicas: number;
    cpu: string;
    memory: string;
    runtimeEnv: Record<string, string>;
  };
  dockerfileChoice?: 'regenerate' | 'keep-manual';
  kustomizeChoice?: 'regenerate' | 'keep-manual';
  handEditedDockerfile?: string;
  handEditedKustomize?: { base: string; overlaysJson: string };
}): { ok: true; artifacts: SpecArtifactsRecord } | ActionFail {
  if (opts.account.disabled) {
    return { ok: false, code: 'FORBIDDEN', error: 'Account disabled' };
  }
  const nameSpace = opts.nameSpace.trim().toLowerCase();
  const appName = opts.appName.trim().toLowerCase();
  const memberships = opts.store.listAllMemberships();
  if (
    !canEditServiceDeploySpecDraft({
      role: opts.account.role,
      username: opts.account.username,
      nameSpace,
      memberships,
    })
  ) {
    return { ok: false, code: 'FORBIDDEN', error: 'Cannot edit Service Deploy Spec artifacts' };
  }
  const draft = opts.store.getSpecDraft(nameSpace, appName);
  if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };

  const previous = opts.store.getSpecArtifacts(nameSpace, appName);
  const dockerFields = {
    baseImage: opts.generate.baseImage,
    artifactPath: opts.generate.artifactPath,
    workdir: opts.generate.workdir,
    entrypoint: opts.generate.entrypoint,
    port: opts.generate.port,
    packagingCommand: draft.packagingCommand,
  };
  const docker = resolveDockerfilePreview({
    fields: dockerFields,
    previous: previous
      ? {
          content: previous.dockerfile.content,
          dirty: previous.dockerfile.dirty,
          fieldsFingerprint: previous.dockerfile.fieldsFingerprint,
        }
      : null,
    choice: opts.dockerfileChoice,
    handEditedContent: opts.handEditedDockerfile,
  });
  if (!docker.ok) {
    return { ok: false, code: docker.code, error: docker.error };
  }

  const kustomizeFields = {
    appName,
    port: opts.generate.port,
    replicas: opts.generate.replicas,
    cpu: opts.generate.cpu,
    memory: opts.generate.memory,
    runtimeEnv: opts.generate.runtimeEnv,
    environments: environmentsForPromotionPath(draft.promotionPath),
  };
  const kustomize = resolveKustomizePreview({
    fields: kustomizeFields,
    previous: previous
      ? {
          base: previous.kustomize.base,
          overlaysJson: previous.kustomize.overlaysJson,
          dirty: previous.kustomize.dirty,
          fieldsFingerprint: previous.kustomize.fieldsFingerprint,
        }
      : null,
    choice: opts.kustomizeChoice,
  });
  if (!kustomize.ok) {
    return { ok: false, code: kustomize.code, error: kustomize.error };
  }
  if (opts.handEditedKustomize) {
    kustomize.preview.base = opts.handEditedKustomize.base;
    kustomize.preview.overlaysJson = opts.handEditedKustomize.overlaysJson;
    kustomize.preview.dirty = true;
  }

  const saved = opts.store.saveSpecArtifacts({
    nameSpace,
    appName,
    dockerfile: {
      content: docker.preview.content,
      dirty: docker.preview.dirty,
      fieldsFingerprint: docker.preview.fieldsFingerprint,
      offCatalogFromWarning: docker.preview.offCatalogFromWarning,
    },
    kustomize: {
      base: kustomize.preview.base,
      overlaysJson: kustomize.preview.overlaysJson,
      dirty: kustomize.preview.dirty,
      fieldsFingerprint: kustomize.preview.fieldsFingerprint,
    },
    generateFields: {
      baseImage: opts.generate.baseImage,
      artifactPath: opts.generate.artifactPath,
      workdir: opts.generate.workdir,
      entrypoint: opts.generate.entrypoint,
      port: opts.generate.port,
      replicas: opts.generate.replicas,
      cpu: opts.generate.cpu,
      memory: opts.generate.memory,
      runtimeEnvJson: JSON.stringify(opts.generate.runtimeEnv),
    },
    updatedBy: opts.account.username,
  });
  if (!saved.ok) return saved;
  return { ok: true, artifacts: saved.artifacts };
}

export function saveServiceDeployResourceRequests(opts: {
  store: ApplicationOnlineStore;
  account: ActorAccount;
  nameSpace: string;
  appName: string;
  sheets: ResourceRequestSheetInput[];
}): { ok: true; sheets: ResourceRequestSheet[] } | ActionFail {
  if (opts.account.disabled) {
    return { ok: false, code: 'FORBIDDEN', error: 'Account disabled' };
  }
  const nameSpace = opts.nameSpace.trim().toLowerCase();
  const appName = opts.appName.trim().toLowerCase();
  const memberships = opts.store.listAllMemberships();
  if (
    !canEditServiceDeploySpecDraft({
      role: opts.account.role,
      username: opts.account.username,
      nameSpace,
      memberships,
    })
  ) {
    return { ok: false, code: 'FORBIDDEN', error: 'Cannot edit Resource Request sheets' };
  }
  const draft = opts.store.getSpecDraft(nameSpace, appName);
  if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };
  const sheets = normalizeResourceRequestSheets(opts.sheets);
  const saved = opts.store.saveResourceRequests({
    nameSpace,
    appName,
    sheets,
    updatedBy: opts.account.username,
  });
  if (!saved.ok) return saved;
  return { ok: true, sheets: saved.sheets };
}

export function saveServiceDeployEnvironmentBindings(opts: {
  store: ApplicationOnlineStore;
  account: ActorAccount;
  nameSpace: string;
  appName: string;
  bindings: EnvironmentBindingInput[];
}): { ok: true; bindings: EnvironmentBinding[] } | ActionFail {
  if (opts.account.disabled) {
    return { ok: false, code: 'FORBIDDEN', error: 'Account disabled' };
  }
  if (!canRecordEnvironmentBinding(opts.account.role)) {
    return { ok: false, code: 'FORBIDDEN', error: 'Operator or Platform Owner required for Binding' };
  }
  const nameSpace = opts.nameSpace.trim().toLowerCase();
  const appName = opts.appName.trim().toLowerCase();
  const draft = opts.store.getSpecDraft(nameSpace, appName);
  if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };
  const bindings = normalizeEnvironmentBindings(opts.bindings);
  const saved = opts.store.saveEnvironmentBindings({
    nameSpace,
    appName,
    bindings,
    updatedBy: opts.account.username,
  });
  if (!saved.ok) return saved;
  return { ok: true, bindings: saved.bindings };
}

export function evaluateServiceDeployQaBindingGate(opts: {
  store: ApplicationOnlineStore;
  nameSpace: string;
  appName: string;
}): { ok: true } | { ok: false; code: 'BAD_REQUEST' | 'NOT_FOUND'; error: string; missing: BindingMissing[] } {
  const nameSpace = opts.nameSpace.trim().toLowerCase();
  const appName = opts.appName.trim().toLowerCase();
  const draft = opts.store.getSpecDraft(nameSpace, appName);
  if (!draft) {
    return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found', missing: [] };
  }
  const sheets =
    opts.store.getResourceRequests(nameSpace, appName) ?? normalizeResourceRequestSheets([]);
  const bindings = opts.store.listEnvironmentBindings(nameSpace, appName);
  const gate = evaluateQaBindingGate({
    promotionPath: draft.promotionPath,
    sheets,
    bindings,
  });
  if (gate.ok) return { ok: true };
  return {
    ok: false,
    code: 'BAD_REQUEST',
    error: 'QA release blocked: filled Resource Requests lack Environment Binding',
    missing: gate.missing,
  };
}

export type CentralPipelineGitLabPort = {
  openMergeRequest(opts: {
    machineToken: string;
    projectPath: string;
    sourceBranch: string;
    targetBranch: string;
    title: string;
    files: Array<{ path: string; content: string }>;
  }): Promise<
    { ok: true; mrUrl: string; mrIid: number } | { ok: false; error: string }
  >;
  getMergeRequestState(opts: {
    machineToken: string;
    projectPath: string;
    mrIid: number;
  }): Promise<
    | { ok: true; merged: true; sha: string }
    | { ok: true; merged: false }
    | { ok: false; error: string }
  >;
};

export type KubeSphereJobPort = {
  createPipelineJob(opts: {
    name: string;
    environment: 'dev';
    templateFamily: string;
    credentialIds: string[];
  }): Promise<{ ok: true; jobId: string } | { ok: false; error: string }>;
};

export type KubeSphereHopJobPort = {
  createPipelineJob(opts: Record<string, unknown> & {
    name: string;
    environment: string;
    templateFamily: string;
    credentialIds: string[];
    publishedPinSha: string;
    sourceImage: string | null;
  }): Promise<{ ok: true; jobId: string } | { ok: false; error: string }>;
};

export type JenkinsDevRunPort = {
  enqueueDevValidate(opts: {
    jobId: string;
    pinnedSha: string;
    defaultRef: string;
  }): Promise<
    | { ok: true; runId: string; status: string }
    | { ok: false; error: string }
  >;
  getDevRunStatus(opts: {
    jobId: string;
    runId: string;
  }): Promise<
    | { ok: true; runId: string; status: string }
    | { ok: false; error: string }
  >;
};

export async function submitServiceDeploySpec(opts: {
  store: ApplicationOnlineStore;
  account: ActorAccount;
  nameSpace: string;
  appName: string;
  gitlab: CentralPipelineGitLabPort;
  machineToken: string;
  centralProjectPath: string;
  dockerfileChoice?: 'regenerate' | 'keep-manual';
  kustomizeChoice?: 'regenerate' | 'keep-manual';
  now?: Date;
}): Promise<
  | { ok: true; mrUrl: string; mrIid: number; canMergeFromNextOps: false }
  | ActionFail
  | { ok: false; code: 'GITLAB_ERROR'; error: string }
> {
  if (opts.account.disabled) {
    return { ok: false, code: 'FORBIDDEN', error: 'Account disabled' };
  }
  const nameSpace = opts.nameSpace.trim().toLowerCase();
  const appName = opts.appName.trim().toLowerCase();
  const memberships = opts.store.listAllMemberships();
  if (
    !canEditServiceDeploySpecDraft({
      role: opts.account.role,
      username: opts.account.username,
      nameSpace,
      memberships,
    })
  ) {
    return { ok: false, code: 'FORBIDDEN', error: 'Cannot submit Service Deploy Spec' };
  }
  if (!opts.machineToken.trim()) {
    return { ok: false, code: 'BAD_REQUEST', error: 'Machine account token is required' };
  }

  const draft = opts.store.getSpecDraft(nameSpace, appName);
  if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };

  const pipeline = evaluatePipelineBlock({
    nameSpace: draft.nameSpace,
    appName: draft.appName,
    gitlabUrl: draft.gitlabUrl,
    promotionPath: draft.promotionPath,
    templateFamily: draft.templateFamily,
    packagingCommand: draft.packagingCommand,
    defaultRef: draft.defaultRef,
    k8sNamespace: draft.k8sNamespace,
  });
  if (!pipeline.ok || !pipeline.complete) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: pipeline.error ?? 'Pipeline block incomplete',
    };
  }

  const artifacts = opts.store.getSpecArtifacts(nameSpace, appName);
  if (!artifacts) {
    return { ok: false, code: 'BAD_REQUEST', error: 'Dockerfile/Kustomize artifacts required' };
  }

  const regenerated = resolveDockerfilePreview({
    fields: {
      baseImage: artifacts.generateFields.baseImage,
      artifactPath: artifacts.generateFields.artifactPath,
      workdir: artifacts.generateFields.workdir,
      entrypoint: artifacts.generateFields.entrypoint,
      port: artifacts.generateFields.port,
      packagingCommand: draft.packagingCommand,
    },
    previous: null,
  });
  const regeneratedDockerfile = regenerated.ok
    ? regenerated.preview.content
    : artifacts.dockerfile.content;

  let runtimeEnv: Record<string, string> = {};
  try {
    runtimeEnv = JSON.parse(artifacts.generateFields.runtimeEnvJson || '{}') as Record<
      string,
      string
    >;
  } catch {
    runtimeEnv = {};
  }
  const kustomizeRegen = resolveKustomizePreview({
    fields: {
      appName,
      port: artifacts.generateFields.port,
      replicas: artifacts.generateFields.replicas,
      cpu: artifacts.generateFields.cpu,
      memory: artifacts.generateFields.memory,
      runtimeEnv,
      environments: environmentsForPromotionPath(draft.promotionPath),
    },
    previous: null,
  });

  const dockerFp = artifacts.dockerfile.fieldsFingerprint;
  const currentDockerFp = regenerated.ok ? regenerated.preview.fieldsFingerprint : dockerFp;
  const kustomizeFp = artifacts.kustomize.fieldsFingerprint;
  const currentKustomizeFp = kustomizeRegen.ok
    ? kustomizeRegen.preview.fieldsFingerprint
    : kustomizeFp;

  const prepared = prepareSpecSubmitArtifacts({
    dockerfile: artifacts.dockerfile,
    kustomize: artifacts.kustomize,
    dockerFieldsChanged: artifacts.dockerfile.dirty && dockerFp !== currentDockerFp,
    kustomizeFieldsChanged: artifacts.kustomize.dirty && kustomizeFp !== currentKustomizeFp,
    dockerfileChoice: opts.dockerfileChoice,
    kustomizeChoice: opts.kustomizeChoice,
    regeneratedDockerfile,
    regeneratedKustomize: kustomizeRegen.ok
      ? {
          base: kustomizeRegen.preview.base,
          overlaysJson: kustomizeRegen.preview.overlaysJson,
        }
      : undefined,
  });
  if (!prepared.ok) {
    return { ok: false, code: prepared.code, error: prepared.error };
  }

  const files = buildCentralPipelineMrFiles({
    nameSpace,
    appName,
    dockerfile: prepared.dockerfileContent,
    pipelineParamsYaml: buildPipelineParamsYaml({
      nameSpace: draft.nameSpace,
      appName: draft.appName,
      gitlabUrl: draft.gitlabUrl,
      promotionPath: draft.promotionPath,
      templateFamily: draft.templateFamily,
      packagingCommand: draft.packagingCommand,
      defaultRef: draft.defaultRef,
    }),
    kustomizeBase: prepared.kustomizeBase,
    overlays: prepared.overlays,
  });
  if (mrPayloadContainsSecrets(files)) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: 'MR payload must not contain kubeconfig, tokens, or passwords',
    };
  }

  const branch = `idp/${nameSpace}/${appName}/${Date.now()}`;
  const opened = await opts.gitlab.openMergeRequest({
    machineToken: opts.machineToken,
    projectPath: opts.centralProjectPath,
    sourceBranch: branch,
    targetBranch: 'main',
    title: `IDP: ${nameSpace}/${appName} Service Deploy Spec`,
    files,
  });
  if (!opened.ok) {
    return { ok: false, code: 'GITLAB_ERROR', error: opened.error };
  }

  const recorded = opts.store.recordSpecMergeRequest({
    nameSpace,
    appName,
    mrUrl: opened.mrUrl,
    mrIid: opened.mrIid,
    now: opts.now,
  });
  if (!recorded.ok) return recorded;

  return {
    ok: true,
    mrUrl: opened.mrUrl,
    mrIid: opened.mrIid,
    canMergeFromNextOps: false,
  };
}

export async function publishMergedSpecAndCreateDevJob(opts: {
  store: ApplicationOnlineStore;
  account: ActorAccount;
  nameSpace: string;
  appName: string;
  gitlab: CentralPipelineGitLabPort;
  kube: KubeSphereJobPort;
  machineToken: string;
  centralProjectPath: string;
  credentialIds: string[];
  now?: Date;
}): Promise<
  | { ok: true; publishedPinSha: string; devJobId: string }
  | ActionFail
  | { ok: false; code: 'GITLAB_ERROR' | 'KUBESPHERE_ERROR'; error: string }
> {
  if (opts.account.disabled) {
    return { ok: false, code: 'FORBIDDEN', error: 'Account disabled' };
  }
  if (opts.account.role !== 'platform_owner' && opts.account.role !== 'operator') {
    return { ok: false, code: 'FORBIDDEN', error: 'Operator or Platform Owner required' };
  }
  const nameSpace = opts.nameSpace.trim().toLowerCase();
  const appName = opts.appName.trim().toLowerCase();
  const draft = opts.store.getSpecDraft(nameSpace, appName);
  if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };
  if (!draft.mrIid || !draft.mrUrl) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: 'Unpublished draft cannot become a job pin',
    };
  }

  const state = await opts.gitlab.getMergeRequestState({
    machineToken: opts.machineToken,
    projectPath: opts.centralProjectPath,
    mrIid: draft.mrIid,
  });
  if (!state.ok) return { ok: false, code: 'GITLAB_ERROR', error: state.error };
  const pinGate = canRecordPublishedPin({
    hasOpenedMr: true,
    mrMerged: state.merged,
    publishedSha: state.merged ? state.sha : '',
  });
  if (!pinGate.ok) return pinGate;
  if (!state.merged) {
    return { ok: false, code: 'BAD_REQUEST', error: 'Central MR must be merged' };
  }

  const job = buildDevKubeSphereJobCreate({
    nameSpace,
    appName,
    templateFamily: draft.templateFamily,
    credentialIds: opts.credentialIds,
  });
  const created = await opts.kube.createPipelineJob(job);
  if (!created.ok) {
    return { ok: false, code: 'KUBESPHERE_ERROR', error: created.error };
  }

  const recorded = opts.store.recordPublishedDevJob({
    nameSpace,
    appName,
    publishedPinSha: state.sha,
    devJobId: created.jobId,
    now: opts.now,
  });
  if (!recorded.ok) return recorded;

  return {
    ok: true,
    publishedPinSha: state.sha,
    devJobId: created.jobId,
  };
}

export async function triggerDevValidate(opts: {
  store: ApplicationOnlineStore;
  account: ActorAccount;
  nameSpace: string;
  appName: string;
  jenkins: JenkinsDevRunPort;
  now?: Date;
}): Promise<
  | { ok: true; runId: string; status: string }
  | ActionFail
  | { ok: false; code: 'JENKINS_ERROR'; error: string }
> {
  if (opts.account.disabled) {
    return { ok: false, code: 'FORBIDDEN', error: 'Account disabled' };
  }
  const nameSpace = opts.nameSpace.trim().toLowerCase();
  const appName = opts.appName.trim().toLowerCase();
  const memberships = opts.store.listAllMemberships();
  if (
    !canTriggerDevValidate({
      role: opts.account.role,
      username: opts.account.username,
      nameSpace,
      memberships,
    })
  ) {
    return { ok: false, code: 'FORBIDDEN', error: 'Cannot trigger 在 Dev 驗證' };
  }
  const draft = opts.store.getSpecDraft(nameSpace, appName);
  if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };

  const built = buildDevValidateEnqueue({
    jobId: draft.devJobId,
    publishedPinSha: draft.publishedPinSha,
    defaultRef: draft.defaultRef,
  });
  if (!built.ok) return built;

  const enqueued = await opts.jenkins.enqueueDevValidate(built.request);
  if (!enqueued.ok) {
    return { ok: false, code: 'JENKINS_ERROR', error: enqueued.error };
  }

  const recorded = opts.store.recordDevValidateRun({
    nameSpace,
    appName,
    runId: enqueued.runId,
    status: enqueued.status,
    now: opts.now,
  });
  if (!recorded.ok) return recorded;

  return { ok: true, runId: enqueued.runId, status: enqueued.status };
}

export function recordRuntimeCheckCallback(opts: {
  store: ApplicationOnlineStore;
  expectedToken: string | null | undefined;
  providedToken: string | null | undefined;
  body: Record<string, unknown>;
  now?: Date;
}):
  | { ok: true; ready: boolean }
  | { ok: false; code: 'UNAUTHORIZED' | 'BAD_REQUEST' | 'NOT_FOUND'; error: string } {
  const auth = authorizeIdpCallbackToken({
    provided: opts.providedToken,
    expected: opts.expectedToken,
  });
  if (!auth.ok) return auth;
  const parsed = parseRuntimeCheckPayload(opts.body);
  if (!parsed.ok) return parsed;
  const draft = opts.store.getSpecDraft(parsed.check.nameSpace, parsed.check.appName);
  if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };
  // Explicitly do not touch pins, membership, jobs, or lastDevRunStatus.
  const saved = opts.store.recordRuntimeCheck({
    nameSpace: parsed.check.nameSpace,
    appName: parsed.check.appName,
    runId: parsed.check.runId,
    ready: parsed.check.ready,
    probe: parsed.check.probe,
    now: opts.now,
  });
  if (!saved.ok) return saved;
  return { ok: true, ready: parsed.check.ready };
}

export async function releaseNextHop(opts: {
  store: ApplicationOnlineStore;
  account: ActorAccount;
  nameSpace: string;
  appName: string;
  targetEnvironment: string;
  imageTag: string;
  credentialIds: string[];
  kubeSphere: KubeSphereHopJobPort;
  now?: Date;
}): Promise<
  | { ok: true; jobId: string; pinSha: string; sourceImage: string | null }
  | ActionFail
  | { ok: false; code: 'KUBESPHERE_ERROR'; error: string }
> {
  if (opts.account.disabled) {
    return { ok: false, code: 'FORBIDDEN', error: 'Account disabled' };
  }
  const nameSpace = opts.nameSpace.trim().toLowerCase();
  const appName = opts.appName.trim().toLowerCase();
  const targetEnvironment = opts.targetEnvironment.trim().toLowerCase();
  const draft = opts.store.getSpecDraft(nameSpace, appName);
  if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };

  const prev = previousHop(draft.promotionPath, targetEnvironment);
  if (!prev) {
    return { ok: false, code: 'BAD_REQUEST', error: 'No previous hop for target environment' };
  }

  const pins = opts.store.listEnvironmentPins(nameSpace, appName);
  const prevPin = pins.find((p) => p.environment === prev);
  const previousHopStatus =
    prev === 'dev' ? draft.lastDevRunStatus : (prevPin?.lastRunStatus ?? null);

  const sheets =
    opts.store.getResourceRequests(nameSpace, appName) ?? normalizeResourceRequestSheets([]);
  const bindings = opts.store.listEnvironmentBindings(nameSpace, appName);
  const bindingGate = evaluateQaBindingGate({
    promotionPath: draft.promotionPath,
    sheets,
    bindings,
  });

  const devPin = pins.find((p) => p.environment === 'dev');
  const familyMatchesPublished =
    !!devPin && devPin.templateFamily === draft.templateFamily;

  const allowed = canReleaseNextHop({
    role: opts.account.role,
    promotionPath: draft.promotionPath,
    targetEnvironment,
    previousHopStatus,
    bindingGateOk: bindingGate.ok,
    familyMatchesPublished,
  });
  if (!allowed.ok) return allowed;

  if (!prevPin?.publishedPinSha) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: `Previous hop ${prev} has no published pin SHA`,
    };
  }

  const sourceImage =
    draft.templateFamily === 'promote'
      ? resolveSourceImage({
          previousEnvironment: prev,
          nameSpace,
          appName,
          imageTag: opts.imageTag,
        })
      : null;

  const job = buildHopJobCreate({
    nameSpace,
    appName,
    environment: targetEnvironment,
    templateFamily: draft.templateFamily,
    publishedPinSha: prevPin.publishedPinSha,
    sourceImage,
    credentialIds: opts.credentialIds,
  });

  const created = await opts.kubeSphere.createPipelineJob(job);
  if (!created.ok) {
    return { ok: false, code: 'KUBESPHERE_ERROR', error: created.error };
  }

  const recorded = opts.store.recordHopPin({
    nameSpace,
    appName,
    environment: targetEnvironment,
    publishedPinSha: prevPin.publishedPinSha,
    jobId: created.jobId,
    imageTag: opts.imageTag,
    sourceImage,
    templateFamily: draft.templateFamily,
    now: opts.now,
  });
  if (!recorded.ok) return recorded;

  return {
    ok: true,
    jobId: created.jobId,
    pinSha: prevPin.publishedPinSha,
    sourceImage,
  };
}

export async function releaseProdPromote(opts: {
  store: ApplicationOnlineStore;
  account: ActorAccount;
  nameSpace: string;
  appName: string;
  imageDigest: string;
  credentialIds: string[];
  kubeSphere: KubeSphereHopJobPort;
  now?: Date;
}): Promise<
  | { ok: true; jobId: string; imageDigest: string }
  | ActionFail
  | { ok: false; code: 'KUBESPHERE_ERROR'; error: string }
> {
  if (opts.account.disabled) {
    return { ok: false, code: 'FORBIDDEN', error: 'Account disabled' };
  }
  if (opts.account.role !== 'operator' && opts.account.role !== 'platform_owner') {
    return { ok: false, code: 'FORBIDDEN', error: 'Only Operator or Platform Owner may release Prod' };
  }
  const nameSpace = opts.nameSpace.trim().toLowerCase();
  const appName = opts.appName.trim().toLowerCase();
  const draft = opts.store.getSpecDraft(nameSpace, appName);
  if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };

  const pins = opts.store.listEnvironmentPins(nameSpace, appName);
  const prev = previousHop(draft.promotionPath, 'prod') ?? 'dev';
  const prevPin = pins.find((p) => p.environment === prev);
  const previousHopStatus =
    prev === 'dev' ? draft.lastDevRunStatus : (prevPin?.lastRunStatus ?? null);
  if (previousHopStatus !== 'success_apply') {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: 'Previous hop must be Jenkins-green through apply before prod-promote',
    };
  }
  const pinSha = prevPin?.publishedPinSha ?? draft.publishedPinSha;
  if (!pinSha) {
    return { ok: false, code: 'BAD_REQUEST', error: 'No published pin SHA for prod-promote' };
  }

  const job = buildProdPromoteJob({
    nameSpace,
    appName,
    imageDigest: opts.imageDigest,
    publishedPinSha: pinSha,
    credentialIds: opts.credentialIds,
  });
  const created = await opts.kubeSphere.createPipelineJob({
    name: job.name,
    environment: 'prod-promote',
    templateFamily: draft.templateFamily,
    credentialIds: job.credentialIds,
    publishedPinSha: job.publishedPinSha,
    sourceImage: null,
    ...job,
  });
  if (!created.ok) {
    return { ok: false, code: 'KUBESPHERE_ERROR', error: created.error };
  }
  const recorded = opts.store.recordHopPin({
    nameSpace,
    appName,
    environment: 'prod-promote',
    publishedPinSha: pinSha,
    jobId: created.jobId,
    imageTag: opts.imageDigest,
    sourceImage: null,
    templateFamily: draft.templateFamily,
    now: opts.now,
  });
  if (!recorded.ok) return recorded;
  opts.store.recordHopRunStatus({
    nameSpace,
    appName,
    environment: 'prod-promote',
    status: 'success_apply',
    now: opts.now,
  });
  return { ok: true, jobId: created.jobId, imageDigest: opts.imageDigest.trim() };
}

export async function releaseProdSite(opts: {
  store: ApplicationOnlineStore;
  account: ActorAccount;
  nameSpace: string;
  appName: string;
  siteId: string;
  credentialIds: string[];
  kubeSphere: KubeSphereHopJobPort;
  now?: Date;
}): Promise<
  | { ok: true; jobId: string; imageDigest: string }
  | ActionFail
  | { ok: false; code: 'KUBESPHERE_ERROR'; error: string }
> {
  if (opts.account.disabled) {
    return { ok: false, code: 'FORBIDDEN', error: 'Account disabled' };
  }
  if (opts.account.role !== 'operator' && opts.account.role !== 'platform_owner') {
    return { ok: false, code: 'FORBIDDEN', error: 'Only Operator or Platform Owner may release Sites' };
  }
  const nameSpace = opts.nameSpace.trim().toLowerCase();
  const appName = opts.appName.trim().toLowerCase();
  const siteId = opts.siteId.trim().toLowerCase();
  const draft = opts.store.getSpecDraft(nameSpace, appName);
  if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };

  const promotePin = opts.store
    .listEnvironmentPins(nameSpace, appName)
    .find((p) => p.environment === 'prod-promote');
  if (!promotePin || promotePin.lastRunStatus !== 'success_apply' || !promotePin.imageTag) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: 'prod-promote must succeed before releasing a Site job',
    };
  }

  const job = buildProdSiteJob({
    nameSpace,
    appName,
    siteId,
    imageDigest: promotePin.imageTag,
    publishedPinSha: promotePin.publishedPinSha,
    credentialIds: opts.credentialIds,
  });
  const created = await opts.kubeSphere.createPipelineJob({
    name: job.name,
    environment: `prod-${siteId}`,
    templateFamily: draft.templateFamily,
    credentialIds: job.credentialIds,
    publishedPinSha: job.publishedPinSha,
    sourceImage: null,
    ...job,
  });
  if (!created.ok) {
    return { ok: false, code: 'KUBESPHERE_ERROR', error: created.error };
  }
  const recorded = opts.store.recordHopPin({
    nameSpace,
    appName,
    environment: `prod-${siteId}`,
    publishedPinSha: promotePin.publishedPinSha,
    jobId: created.jobId,
    imageTag: promotePin.imageTag,
    sourceImage: null,
    templateFamily: draft.templateFamily,
    now: opts.now,
  });
  if (!recorded.ok) return recorded;
  return { ok: true, jobId: created.jobId, imageDigest: promotePin.imageTag };
}

export function invokeBreakGlassSkip(opts: {
  store: ApplicationOnlineStore;
  account: ActorAccount;
  nameSpace: string;
  appName: string;
  hop: string;
  rule: BreakGlassRule;
  reason: string;
  now?: Date;
}): { ok: true; entry: BreakGlassEntry } | ActionFail {
  if (opts.account.disabled) {
    return { ok: false, code: 'FORBIDDEN', error: 'Account disabled' };
  }
  if (!canInvokeBreakGlass(opts.account.role)) {
    return { ok: false, code: 'FORBIDDEN', error: 'Only Operator or Platform Owner may break-glass' };
  }
  const reason = opts.reason.trim();
  if (!reason) {
    return { ok: false, code: 'BAD_REQUEST', error: 'Break-glass reason is required' };
  }
  const nameSpace = opts.nameSpace.trim().toLowerCase();
  const appName = opts.appName.trim().toLowerCase();
  const draft = opts.store.getSpecDraft(nameSpace, appName);
  if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };
  return opts.store.appendBreakGlass({
    nameSpace,
    appName,
    hop: opts.hop,
    reason,
    actor: opts.account.username,
    rule: opts.rule,
    now: opts.now,
  });
}
