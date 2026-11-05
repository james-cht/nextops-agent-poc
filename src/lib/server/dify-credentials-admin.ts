import type { ConfigAuditStore } from './config-audit-log.ts';
import { appendConfigAuditEntry } from './config-audit-log.ts';
import type { ProbeResult } from './dify-credential-probes.ts';
import {
  clearDifyCredentialOverride,
  getEffectiveDifyCredentials,
  setDifyCredentialOverride,
  type DifyOverrideStore,
} from './dify-credentials.ts';
import { mergeDifyCredentialPatch, type DifyCredentialValues } from '../dify-credentials-policy.ts';

export type AdminApplyOk = {
  ok: true;
  credentials: ReturnType<typeof getEffectiveDifyCredentials>;
};

export type AdminApplyErr = {
  ok: false;
  code: 'UNAUTHORIZED' | 'BAD_REQUEST' | 'TEST_FAILED';
  error: string;
};

export type AdminApplyResult = AdminApplyOk | AdminApplyErr;

export type DifyAdminDeps = {
  adminPassword: string;
  verifyStepUp: (password: string) => Promise<boolean>;
  actor: string;
  env: DifyCredentialValues;
  store?: DifyOverrideStore & ConfigAuditStore;
  dataDir?: string;
  origin: string;
  probeTool: (c: { toolToken: string; origin: string }) => Promise<ProbeResult>;
  logLine?: (line: string) => void;
};

function auditOpts(deps: DifyAdminDeps) {
  return { store: deps.store, dataDir: deps.dataDir, logLine: deps.logLine };
}

async function requirePassword(
  deps: DifyAdminDeps,
  action: 'save' | 'restore',
): Promise<AdminApplyErr | null> {
  const ok = await deps.verifyStepUp(deps.adminPassword);
  if (!ok) {
    appendConfigAuditEntry(
      {
        action,
        setting: 'tool_endpoint_token',
        outcome: 'rejected',
        actor: deps.actor,
        detail: { reason: 'bad_password' },
      },
      auditOpts(deps),
    );
    return { ok: false, code: 'UNAUTHORIZED', error: 'Admin password required' };
  }
  return null;
}

export async function applyDifyCredentialsSave(
  deps: DifyAdminDeps & { patch: Partial<DifyCredentialValues> },
): Promise<AdminApplyResult> {
  const authErr = await requirePassword(deps, 'save');
  if (authErr) return authErr;

  const storeOpts = { store: deps.store, dataDir: deps.dataDir, env: deps.env };
  const current = getEffectiveDifyCredentials(storeOpts);
  const previousOverride =
    current.source === 'override'
      ? {
          baseUrl: current.baseUrl,
          apiKey: current.apiKey,
          toolToken: current.toolToken,
        }
      : null;

  const merged = mergeDifyCredentialPatch(current, deps.patch);
  const next: DifyCredentialValues = {
    baseUrl: merged.baseUrl,
    apiKey: merged.apiKey,
    toolToken: merged.toolToken,
  };
  if (!next.toolToken) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: 'NEXTOPS_DIFY_TOKEN is required',
    };
  }

  setDifyCredentialOverride(next, { store: deps.store, dataDir: deps.dataDir });
  const tool = await deps.probeTool({ toolToken: next.toolToken, origin: deps.origin });
  if (!tool.ok) {
    if (previousOverride) {
      setDifyCredentialOverride(previousOverride, { store: deps.store, dataDir: deps.dataDir });
    } else {
      clearDifyCredentialOverride({ store: deps.store, dataDir: deps.dataDir });
    }
    appendConfigAuditEntry(
      {
        action: 'save',
        setting: 'tool_endpoint_token',
        outcome: 'test_failed',
        actor: deps.actor,
        detail: { probe: 'tool_token', error: tool.error },
      },
      auditOpts(deps),
    );
    return { ok: false, code: 'TEST_FAILED', error: tool.error };
  }

  appendConfigAuditEntry(
    {
      action: 'save',
      setting: 'tool_endpoint_token',
      outcome: 'saved',
      actor: deps.actor,
      detail: {
        fieldsChanged: ['toolToken'].filter((k) => {
          const key = k as keyof DifyCredentialValues;
          return deps.patch[key] !== undefined && String(deps.patch[key] ?? '').trim() !== '';
        }),
        source: 'override',
      },
    },
    auditOpts(deps),
  );
  return {
    ok: true,
    credentials: getEffectiveDifyCredentials(storeOpts),
  };
}

export async function applyDifyCredentialsRestore(
  deps: DifyAdminDeps,
): Promise<AdminApplyResult> {
  const authErr = await requirePassword(deps, 'restore');
  if (authErr) return authErr;

  const storeOpts = { store: deps.store, dataDir: deps.dataDir, env: deps.env };
  const current = getEffectiveDifyCredentials(storeOpts);
  const previousOverride =
    current.source === 'override'
      ? {
          baseUrl: current.baseUrl,
          apiKey: current.apiKey,
          toolToken: current.toolToken,
        }
      : null;

  clearDifyCredentialOverride({ store: deps.store, dataDir: deps.dataDir });
  const tool = await deps.probeTool({
    toolToken: deps.env.toolToken,
    origin: deps.origin,
  });
  if (!tool.ok) {
    if (previousOverride) {
      setDifyCredentialOverride(previousOverride, { store: deps.store, dataDir: deps.dataDir });
    }
    appendConfigAuditEntry(
      {
        action: 'restore',
        setting: 'tool_endpoint_token',
        outcome: 'test_failed',
        actor: deps.actor,
        detail: { probe: 'tool_token', error: tool.error },
      },
      auditOpts(deps),
    );
    return { ok: false, code: 'TEST_FAILED', error: tool.error };
  }

  appendConfigAuditEntry(
    {
      action: 'restore',
      setting: 'tool_endpoint_token',
      outcome: 'restored',
      actor: deps.actor,
      detail: { source: 'env' },
    },
    auditOpts(deps),
  );
  return {
    ok: true,
    credentials: getEffectiveDifyCredentials(storeOpts),
  };
}
