import type { OperatorRole } from './operator-role.ts';
import { environmentsForPromotionPath } from './service-deploy-artifacts.ts';
import type { PromotionPath, TemplateFamily } from './service-deploy-spec.ts';

export type LadderEnvironment = string;

export function jobsAllowedOnPath(path: PromotionPath): string[] {
  return environmentsForPromotionPath(path);
}

export function previousHop(path: PromotionPath, target: string): string | null {
  const envs = jobsAllowedOnPath(path);
  const idx = envs.indexOf(target);
  if (idx <= 0) return null;
  return envs[idx - 1] ?? null;
}

/** Harbor-style SOURCE_IMAGE derived from previous hop (parameterized; not hardcoded QA). */
export function resolveSourceImage(opts: {
  previousEnvironment: string;
  nameSpace: string;
  appName: string;
  imageTag: string;
  registryHost?: string;
}): string {
  const host = (opts.registryHost ?? 'harbor.example').replace(/\/$/, '');
  const nameSpace = opts.nameSpace.trim().toLowerCase();
  const appName = opts.appName.trim().toLowerCase();
  const env = opts.previousEnvironment.trim().toLowerCase();
  const tag = opts.imageTag.trim();
  return `${host}/${nameSpace}/${appName}-${env}:${tag}`;
}

export type HopJobCreate = {
  name: string;
  environment: string;
  templateFamily: TemplateFamily;
  publishedPinSha: string;
  sourceImage: string | null;
  credentialIds: string[];
};

export function buildHopJobCreate(opts: {
  nameSpace: string;
  appName: string;
  environment: string;
  templateFamily: TemplateFamily;
  publishedPinSha: string;
  sourceImage: string | null;
  credentialIds: string[];
}): HopJobCreate {
  const appName = opts.appName.trim().toLowerCase();
  const environment = opts.environment.trim().toLowerCase();
  return {
    name: `${appName}-${environment}`,
    environment,
    templateFamily: opts.templateFamily,
    publishedPinSha: opts.publishedPinSha.trim(),
    sourceImage: opts.sourceImage,
    credentialIds: [...opts.credentialIds],
  };
}

export function canReleaseNextHop(opts: {
  role: OperatorRole;
  promotionPath: PromotionPath;
  targetEnvironment: string;
  previousHopStatus: string | null | undefined;
  bindingGateOk: boolean;
  familyMatchesPublished: boolean;
}): { ok: true } | { ok: false; code: 'FORBIDDEN' | 'BAD_REQUEST'; error: string } {
  if (opts.role !== 'operator' && opts.role !== 'platform_owner') {
    return { ok: false, code: 'FORBIDDEN', error: 'Only Operator or Platform Owner may release' };
  }
  const allowed = jobsAllowedOnPath(opts.promotionPath);
  if (!allowed.includes(opts.targetEnvironment)) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: `Environment ${opts.targetEnvironment} is not on Promotion Path`,
    };
  }
  if (opts.targetEnvironment === 'dev') {
    return { ok: false, code: 'BAD_REQUEST', error: 'Dev is created at publish, not via hop release' };
  }
  if (opts.previousHopStatus !== 'success_apply') {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: 'Previous hop must be Jenkins-green through apply',
    };
  }
  if (opts.targetEnvironment === 'qa' && !opts.bindingGateOk) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: 'QA release blocked: Environment Binding gate failed',
    };
  }
  if (!opts.familyMatchesPublished) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: 'Template family changed; re-validate Dev before releasing',
    };
  }
  return { ok: true };
}
