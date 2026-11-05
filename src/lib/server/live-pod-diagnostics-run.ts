import { randomBytes } from 'node:crypto';

import {
  buildLivePodDiagnosticsTriggerBody,
  classifyLivePodDiagnosticsRow,
  evaluateLivePodDiagnosticsSelection,
  omitLivePodDiagnosticsSecret,
  evaluateLivePodDiagnosticsStart,
  type LivePodDiagnosticsRowPhase,
  type LivePodDiagnosticsStartErr,
  type LivePodOccupancyKey,
} from '../live-pod-diagnostics.ts';
import type { OperatorRole } from '../operator-role.ts';
import type { LivePodOccupancyRecord, LocalSettingsStore } from './local-settings-store.ts';

export function generateLivePodDiagnosticsTaskId(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10).replaceAll('-', '');
  return `api-task-${stamp}-${randomBytes(4).toString('hex')}`;
}

export const LIVE_POD_DIAGNOSTICS_TABLE = 'k8s_pod_diagnostics';

/**
 * Shared-host Application Proxy closes a backend request at 85s (180s if Long).
 * The browser must receive JSON before that, or the window never opens.
 */
export const LIVE_POD_TRIGGER_TIMEOUT_MS = 70_000;

export type StartLivePodDiagnosticsOk = {
  ok: true;
  taskId: string;
  occupancy: LivePodOccupancyKey;
};

export type StartLivePodDiagnosticsErr = {
  ok: false;
  code: LivePodDiagnosticsStartErr['code'] | 'TRIGGER_FAILED' | 'NOT_CONFIGURED';
  taskId?: string;
  upstreamStatus?: number;
  upstreamMessage?: string;
};

export const ROBUSTA_API_DIAGNOSTIC_SERVICE = 'Robusta API';

export type RobustaApiDiagnosticContext = {
  service: typeof ROBUSTA_API_DIAGNOSTIC_SERVICE;
  message: string;
  detail?: string;
  upstreamUrl?: string;
  siteId?: string;
  dependency: 'Robusta';
  proxyEnabled?: boolean;
};

function redactSecret(text: string, secret: string): string {
  const trimmed = secret.trim();
  if (!trimmed) return text;
  return text.split(trimmed).join('[REDACTED]');
}

export function describeRobustaApiHttpFailure(input: {
  status: number;
  body: string;
  token: string;
}): string {
  const snippet = redactSecret(input.body, input.token).replace(/\s+/g, ' ').trim().slice(0, 180);
  return snippet ? `Robusta API HTTP ${input.status}: ${snippet}` : `Robusta API HTTP ${input.status}`;
}

/** Upstream Diagnosis entry for the Robusta action trigger. Distinct from Robusta Store (MySQL). */
export function robustaApiDiagnosticContext(input: {
  siteId: string;
  triggerUrl: string;
  code: 'TRIGGER_FAILED' | 'NOT_CONFIGURED';
  upstreamStatus?: number;
  upstreamMessage?: string;
  proxyEnabled?: boolean;
  token?: string;
}): RobustaApiDiagnosticContext {
  const raw =
    input.upstreamMessage?.trim() ||
    (input.code === 'NOT_CONFIGURED'
      ? '未設定 Robusta 觸發 URL 或 Action Token。'
      : '無法呼叫 Robusta 觸發 API。');
  const message = redactSecret(raw, input.token ?? '');
  const url = input.triggerUrl.trim();
  return {
    service: ROBUSTA_API_DIAGNOSTIC_SERVICE,
    message,
    detail: input.upstreamStatus ? `HTTP ${input.upstreamStatus}` : undefined,
    upstreamUrl: url ? redactSecret(url, input.token ?? '') : undefined,
    siteId: input.siteId,
    dependency: 'Robusta',
    proxyEnabled: input.proxyEnabled,
  };
}

export type StartLivePodDiagnosticsResult = StartLivePodDiagnosticsOk | StartLivePodDiagnosticsErr;

export async function startLivePodDiagnostics(input: {
  store: LocalSettingsStore;
  siteId: string;
  sources: readonly unknown[];
  robustaCoverage: boolean;
  role: OperatorRole | null | undefined;
  triggerUrl: string;
  actionToken: string;
  taskId: string;
  fetchImpl: typeof fetch;
  triggerTimeoutMs?: number;
}): Promise<StartLivePodDiagnosticsResult> {
  const url = input.triggerUrl.trim();
  const token = input.actionToken.trim();
  if (!url || !token) {
    return { ok: false, code: 'NOT_CONFIGURED' };
  }

  const selected = evaluateLivePodDiagnosticsSelection({
    siteId: input.siteId,
    sources: input.sources,
  });
  if (!selected.ok) return selected;

  const current = input.store.getLivePodOccupancy(selected.occupancy);
  const gated = evaluateLivePodDiagnosticsStart({
    siteId: input.siteId,
    sources: input.sources,
    robustaCoverage: input.robustaCoverage,
    role: input.role,
    occupancyInFlight: current?.inFlight === true,
  });
  if (!gated.ok) {
    if (gated.code === 'IN_FLIGHT' && current?.taskId) {
      return { ok: false, code: 'IN_FLIGHT', taskId: current.taskId };
    }
    return gated;
  }

  const began = input.store.beginLivePodOccupancy(gated.occupancy, input.taskId);
  if (!began.ok) {
    const raced = input.store.getLivePodOccupancy(gated.occupancy);
    return { ok: false, code: 'IN_FLIGHT', taskId: raced?.taskId };
  }

  const body = buildLivePodDiagnosticsTriggerBody({
    pod: gated.occupancy.pod,
    namespace: gated.occupancy.namespace,
    token,
    taskId: input.taskId,
  });

  let accepted = false;
  let upstreamStatus: number | undefined;
  let upstreamMessage: string | undefined;
  try {
    const res = await input.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(input.triggerTimeoutMs ?? LIVE_POD_TRIGGER_TIMEOUT_MS),
    });
    accepted = res.ok;
    if (!res.ok) {
      upstreamStatus = res.status;
      const responseText = await res.text().catch(() => '');
      upstreamMessage = describeRobustaApiHttpFailure({
        status: res.status,
        body: responseText,
        token,
      });
    }
  } catch (e) {
    accepted = false;
    upstreamMessage = redactSecret(e instanceof Error ? e.message : 'Robusta API unreachable', token);
  }

  if (!accepted) {
    input.store.abandonLivePodOccupancy(input.taskId);
    return { ok: false, code: 'TRIGGER_FAILED', upstreamStatus, upstreamMessage };
  }

  return { ok: true, taskId: input.taskId, occupancy: gated.occupancy };
}

export function livePodDiagnosticsRowSql(): string {
  return `SELECT * FROM \`${LIVE_POD_DIAGNOSTICS_TABLE}\` WHERE \`task_id\` = ? LIMIT 1`;
}

export async function loadLivePodDiagnosticsResult(input: {
  store: LocalSettingsStore;
  taskId: string;
  query: (sql: string, params: unknown[]) => Promise<unknown[]>;
}): Promise<{
  occupancy: LivePodOccupancyRecord | null;
  phase: LivePodDiagnosticsRowPhase;
  row: Record<string, unknown> | null;
}> {
  const occupancy = input.store.getLivePodOccupancyByTaskId(input.taskId);
  const rows = await input.query(livePodDiagnosticsRowSql(), [input.taskId]);
  const raw = rows[0];
  const row =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  const phase = classifyLivePodDiagnosticsRow(row);
  if (occupancy?.inFlight && (phase === 'success' || phase === 'failure')) {
    input.store.completeLivePodOccupancy(input.taskId);
  }
  const shown = omitLivePodDiagnosticsSecret(row);
  return {
    occupancy: input.store.getLivePodOccupancyByTaskId(input.taskId) ?? occupancy,
    phase,
    row:
      shown && typeof shown === 'object' && !Array.isArray(shown)
        ? (shown as Record<string, unknown>)
        : null,
  };
}
