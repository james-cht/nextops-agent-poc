import type { OperatorRole } from './operator-role.ts';

export const PROMOTION_PATHS = [
  'dev→qa→uat→prod',
  'dev→uat→prod',
  'dev→prod',
  'dev→qa→prod',
] as const;

export type PromotionPath = (typeof PROMOTION_PATHS)[number];

export const TEMPLATE_FAMILIES = ['promote', 'web-rebuild'] as const;

export type TemplateFamily = (typeof TEMPLATE_FAMILIES)[number];

export type PipelineBlockInput = {
  nameSpace: string;
  appName: string;
  gitlabUrl: string;
  promotionPath: string;
  templateFamily: string;
  packagingCommand: string;
  defaultRef: string;
  k8sNamespace: string;
};

export type NormalizedPipelineBlock = {
  nameSpace: string;
  appName: string;
  gitlabUrl: string;
  promotionPath: PromotionPath;
  templateFamily: TemplateFamily;
  packagingCommand: string;
  defaultRef: string;
  k8sNamespace: string;
};

const APP_NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const ENV_SUFFIX_RE = /-(dev|prod)$/i;
const NAME_SPACE_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function isValidAppName(appName: string): boolean {
  const trimmed = appName.trim();
  if (!trimmed || !APP_NAME_RE.test(trimmed)) return false;
  if (ENV_SUFFIX_RE.test(trimmed)) return false;
  return true;
}

function isPromotionPath(value: string): value is PromotionPath {
  return (PROMOTION_PATHS as readonly string[]).includes(value);
}

function isTemplateFamily(value: string): value is TemplateFamily {
  return (TEMPLATE_FAMILIES as readonly string[]).includes(value);
}

export type PipelineBlockEvaluation = {
  ok: boolean;
  complete: boolean;
  missing: string[];
  error?: string;
  normalized?: NormalizedPipelineBlock;
};

export function evaluatePipelineBlock(input: PipelineBlockInput): PipelineBlockEvaluation {
  const nameSpace = input.nameSpace.trim().toLowerCase();
  const appName = input.appName.trim().toLowerCase();
  const gitlabUrl = input.gitlabUrl.trim();
  const promotionPath = input.promotionPath.trim();
  const templateFamily = input.templateFamily.trim();
  const packagingCommand = input.packagingCommand.trim();
  const defaultRef = input.defaultRef.trim();
  const k8sNamespace = input.k8sNamespace.trim();

  const missing: string[] = [];
  if (!nameSpace) missing.push('NAME_SPACE');
  if (!appName) missing.push('APP_NAME');
  if (!gitlabUrl) missing.push('GITLAB_URL');
  if (!promotionPath) missing.push('Promotion Path');
  if (!templateFamily) missing.push('templateFamily');
  if (!packagingCommand) missing.push('PACKAGING_COMMAND');
  if (!defaultRef) missing.push('defaultRef');

  if (missing.length > 0) {
    return { ok: false, complete: false, missing, error: `Missing: ${missing.join(', ')}` };
  }

  if (!NAME_SPACE_RE.test(nameSpace)) {
    return {
      ok: false,
      complete: false,
      missing: [],
      error: 'NAME_SPACE must be lowercase letters, digits, and hyphens',
    };
  }
  if (!isValidAppName(appName)) {
    return {
      ok: false,
      complete: false,
      missing: [],
      error: 'APP_NAME must not use -dev/-prod suffixes and must be a valid service name',
    };
  }
  if (!isPromotionPath(promotionPath)) {
    return {
      ok: false,
      complete: false,
      missing: [],
      error: 'Promotion Path must be one of the four catalog entries',
    };
  }
  if (!isTemplateFamily(templateFamily)) {
    return {
      ok: false,
      complete: false,
      missing: [],
      error: 'template family must be promote or web-rebuild',
    };
  }

  return {
    ok: true,
    complete: true,
    missing: [],
    normalized: {
      nameSpace,
      appName,
      gitlabUrl,
      promotionPath,
      templateFamily,
      packagingCommand,
      defaultRef,
      k8sNamespace,
    },
  };
}

export function canEditServiceDeploySpecDraft(opts: {
  role: OperatorRole;
  username: string;
  nameSpace: string;
  memberships: Array<{ nameSpace: string; username: string }>;
}): boolean {
  if (opts.role === 'platform_owner' || opts.role === 'operator') return true;
  if (opts.role !== 'application_developer') return false;
  return opts.memberships.some(
    (m) => m.nameSpace === opts.nameSpace && m.username === opts.username,
  );
}
