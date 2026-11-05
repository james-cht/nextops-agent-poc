import type { OperatorRole } from './operator-role.ts';
import { environmentsForPromotionPath } from './service-deploy-artifacts.ts';
import type { PromotionPath } from './service-deploy-spec.ts';
import {
  RESOURCE_REQUEST_KINDS,
  stripSecretFields,
  type ResourceRequestKind,
  type ResourceRequestSheet,
} from './resource-request.ts';

export type EnvironmentBindingInput = {
  environment: string;
  kind: ResourceRequestKind;
  fields?: Record<string, string>;
};

export type EnvironmentBinding = {
  environment: string;
  kind: ResourceRequestKind;
  fields: Record<string, string>;
};

export type BindingMissing = {
  environment: string;
  kind: ResourceRequestKind;
};

export type ConfigCheckItem = {
  level: 'error' | 'warn' | 'ok';
  message: string;
};

export type ConfigCheckResult = {
  items: ConfigCheckItem[];
  blocksQaRelease: boolean;
  /** Always false — Environment Binding never gates Dev validate. */
  blocksDevValidate: false;
};

const ENV_RE = /^(dev|qa|uat|prod)$/;

/** Environments at QA and later on the path (Binding gate targets). Empty when path has no QA. */
export function bindingEnvironmentsForPath(path: PromotionPath): string[] {
  const envs = environmentsForPromotionPath(path);
  const qaIndex = envs.indexOf('qa');
  if (qaIndex < 0) return [];
  return envs.slice(qaIndex);
}

export function normalizeEnvironmentBindings(
  inputs: EnvironmentBindingInput[],
): EnvironmentBinding[] {
  const out: EnvironmentBinding[] = [];
  for (const input of inputs) {
    const environment = input.environment.trim().toLowerCase();
    if (!ENV_RE.test(environment)) continue;
    if (!(RESOURCE_REQUEST_KINDS as readonly string[]).includes(input.kind)) continue;
    const fields = stripSecretFields(input.fields ?? {});
    if (Object.keys(fields).length === 0) continue;
    out.push({ environment, kind: input.kind, fields });
  }
  return out;
}

function neededKinds(sheets: ResourceRequestSheet[]): ResourceRequestKind[] {
  return sheets.filter((s) => s.status === 'needed').map((s) => s.kind);
}

function hasBinding(
  bindings: EnvironmentBinding[],
  environment: string,
  kind: ResourceRequestKind,
): boolean {
  return bindings.some(
    (b) =>
      b.environment === environment &&
      b.kind === kind &&
      Object.keys(b.fields).length > 0,
  );
}

export function listMissingBindings(opts: {
  promotionPath: PromotionPath;
  sheets: ResourceRequestSheet[];
  bindings: EnvironmentBinding[];
}): BindingMissing[] {
  const envs = bindingEnvironmentsForPath(opts.promotionPath);
  const kinds = neededKinds(opts.sheets);
  const missing: BindingMissing[] = [];
  for (const environment of envs) {
    for (const kind of kinds) {
      if (!hasBinding(opts.bindings, environment, kind)) {
        missing.push({ environment, kind });
      }
    }
  }
  return missing;
}

export function evaluateQaBindingGate(opts: {
  promotionPath: PromotionPath;
  sheets: ResourceRequestSheet[];
  bindings: EnvironmentBinding[];
}): { ok: true } | { ok: false; missing: BindingMissing[] } {
  const missing = listMissingBindings(opts);
  if (missing.length === 0) return { ok: true };
  return { ok: false, missing };
}

export function computeConfigCheck(opts: {
  promotionPath: PromotionPath;
  sheets: ResourceRequestSheet[];
  bindings: EnvironmentBinding[];
  offCatalogFromWarning?: boolean;
}): ConfigCheckResult {
  const items: ConfigCheckItem[] = [];
  const missing = listMissingBindings(opts);
  for (const m of missing) {
    items.push({
      level: 'error',
      message: `${m.environment} ${m.kind} missing Environment Binding`,
    });
  }
  if (opts.offCatalogFromWarning) {
    items.push({
      level: 'warn',
      message: 'Dockerfile FROM is off catalog (Config Check warning)',
    });
  }
  if (missing.length === 0 && !opts.offCatalogFromWarning) {
    items.push({ level: 'ok', message: 'Config Check clear for Binding and FROM' });
  }
  return {
    items,
    blocksQaRelease: missing.length > 0,
    blocksDevValidate: false,
  };
}

/** Operators record Environment Binding; Developers and Viewers do not. */
export function canRecordEnvironmentBinding(role: OperatorRole | null | undefined): boolean {
  return role === 'operator' || role === 'platform_owner';
}
