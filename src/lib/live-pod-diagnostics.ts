/**
 * Live Pod Diagnostics — selection, occupancy key, start gates (ADR-0030).
 */

import { LOG_NAMESPACE_FIELD, LOG_POD_FIELD } from './log-k8s-scope.ts';
import { canStartDiagnosisTurn, type OperatorRole } from './operator-role.ts';
import { getByPath } from './log-summary-projection.ts';

export type LivePodOccupancyKey = {
  siteId: string;
  namespace: string;
  pod: string;
};

export type LivePodDiagnosticsSelectionOk = {
  ok: true;
  occupancy: LivePodOccupancyKey;
};

export type LivePodDiagnosticsSelectionErr = {
  ok: false;
  code: 'NOT_ONE_ROW' | 'MISSING_POD_SCOPE';
};

export type LivePodDiagnosticsSelectionResult =
  | LivePodDiagnosticsSelectionOk
  | LivePodDiagnosticsSelectionErr;

export type LivePodDiagnosticsStartErr = {
  ok: false;
  code:
    | LivePodDiagnosticsSelectionErr['code']
    | 'NO_COVERAGE'
    | 'VIEWER'
    | 'IN_FLIGHT';
};

export type LivePodDiagnosticsStartResult =
  | LivePodDiagnosticsSelectionOk
  | LivePodDiagnosticsStartErr;

/** Selection plus Coverage, Viewer, and in-flight occupancy. Cluster Key is not a gate. */
export function evaluateLivePodDiagnosticsStart(input: {
  siteId: string;
  sources: readonly unknown[];
  robustaCoverage: boolean;
  role: OperatorRole | null | undefined;
  occupancyInFlight: boolean;
}): LivePodDiagnosticsStartResult {
  const selected = evaluateLivePodDiagnosticsSelection({
    siteId: input.siteId,
    sources: input.sources,
  });
  if (!selected.ok) return selected;
  if (!input.robustaCoverage) {
    return { ok: false, code: 'NO_COVERAGE' };
  }
  if (!canStartDiagnosisTurn(input.role)) {
    return { ok: false, code: 'VIEWER' };
  }
  if (input.occupancyInFlight) {
    return { ok: false, code: 'IN_FLIGHT' };
  }
  return selected;
}

export type LivePodDiagnosticsRowPhase = 'pending' | 'success' | 'failure';

/** Retrieved Store JSON is success. No row yet stays pending so occupancy is not released early. */
export function classifyLivePodDiagnosticsRow(row: unknown): LivePodDiagnosticsRowPhase {
  if (row && typeof row === 'object' && !Array.isArray(row)) return 'success';
  return 'pending';
}

export type LivePodDiagnosticsTriggerBody = {
  action_name: 'k8s_pod_diagnostics';
  action_params: {
    pod_name: string;
    namespace: string;
    token: string;
    task_id: string;
  };
};

export function buildLivePodDiagnosticsTriggerBody(input: {
  pod: string;
  namespace: string;
  token: string;
  taskId: string;
}): LivePodDiagnosticsTriggerBody {
  return {
    action_name: 'k8s_pod_diagnostics',
    action_params: {
      pod_name: input.pod,
      namespace: input.namespace,
      token: input.token,
      task_id: input.taskId,
    },
  };
}

function fieldString(source: unknown, path: string): string {
  const nested = getByPath(source, path);
  if (typeof nested === 'string' && nested.trim()) return nested.trim();
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const literal = (source as Record<string, unknown>)[path];
    if (typeof literal === 'string' && literal.trim()) return literal.trim();
  }
  return '';
}

function firstFieldString(source: unknown, paths: readonly string[]): string {
  for (const path of paths) {
    const v = fieldString(source, path);
    if (v) return v;
  }
  return '';
}

const LIVE_POD_NAMESPACE_PATHS = [
  LOG_NAMESPACE_FIELD,
  'k8s.namespace',
  'k8s.nameSpace',
] as const;

const LIVE_POD_POD_PATHS = [LOG_POD_FIELD, 'k8s.podName'] as const;

/** Exactly one selected `_source` whose allowlisted fields resolve to namespace + pod. */
export function evaluateLivePodDiagnosticsSelection(input: {
  siteId: string;
  sources: readonly unknown[];
}): LivePodDiagnosticsSelectionResult {
  if (input.sources.length !== 1) {
    return { ok: false, code: 'NOT_ONE_ROW' };
  }
  const namespace = firstFieldString(input.sources[0], LIVE_POD_NAMESPACE_PATHS);
  const pod = firstFieldString(input.sources[0], LIVE_POD_POD_PATHS);
  if (!namespace || !pod) {
    return { ok: false, code: 'MISSING_POD_SCOPE' };
  }
  return {
    ok: true,
    occupancy: { siteId: input.siteId, namespace, pod },
  };
}

export type LivePodOccupancyView = LivePodOccupancyKey & {
  taskId: string;
  inFlight: boolean;
};

/** Latest Task for this log row's pod, if occupancy exists. */
export function livePodOccupancyForSource(
  items: readonly LivePodOccupancyView[],
  siteId: string,
  source: unknown,
): LivePodOccupancyView | null {
  const selected = evaluateLivePodDiagnosticsSelection({ siteId, sources: [source] });
  if (!selected.ok) return null;
  return (
    items.find(
      (item) =>
        item.siteId === selected.occupancy.siteId &&
        item.namespace === selected.occupancy.namespace &&
        item.pod === selected.occupancy.pod,
    ) ?? null
  );
}

export function livePodDiagnosticsGateMessage(
  code: LivePodDiagnosticsStartErr['code'] | 'TRIGGER_FAILED' | 'NOT_CONFIGURED',
): string {
  switch (code) {
    case 'NOT_ONE_ROW':
      return '請單獨選一筆帶有 Log Namespace 與 Log Pod 的日誌再觸發。';
    case 'MISSING_POD_SCOPE':
      return '應用即時狀態分析只適用於 Kubernetes Pod；此列沒有 Log Namespace 與 Log Pod。';
    case 'NO_COVERAGE':
      return '此 Site 未部署 Robusta，無法使用應用即時狀態分析。';
    case 'VIEWER':
      return '目前角色為 Viewer，無法觸發應用即時狀態分析。';
    case 'IN_FLIGHT':
      return '此 Pod 的應用即時狀態分析進行中，請等待結果完成後即可查看，請勿重複觸發。';
    case 'TRIGGER_FAILED':
      return '無法呼叫 Robusta 觸發 API。';
    case 'NOT_CONFIGURED':
      return '未設定 Robusta 觸發 URL 或 Action Token。';
  }
}

export type LivePodDiagnosticsHttpPresentation = {
  taskId: string;
  phase: 'pending';
  error: string;
  namespace: string;
  pod: string;
};

/**
 * What the Live Pod Diagnostics Window shows after POST /api/logs/live-pod-diagnostics.
 * A 502 (app trigger failure or the shared-host gateway) still opens the window.
 */
export function presentLivePodDiagnosticsHttpResult(input: {
  status: number;
  body: unknown;
}): LivePodDiagnosticsHttpPresentation {
  const record =
    input.body && typeof input.body === 'object' && !Array.isArray(input.body)
      ? (input.body as Record<string, unknown>)
      : null;
  const occupancy =
    record?.occupancy && typeof record.occupancy === 'object' && !Array.isArray(record.occupancy)
      ? (record.occupancy as Record<string, unknown>)
      : null;
  const taskId = typeof record?.taskId === 'string' ? record.taskId : '';
  const namespace = typeof occupancy?.namespace === 'string' ? occupancy.namespace : '';
  const pod = typeof occupancy?.pod === 'string' ? occupancy.pod : '';
  if ((input.status === 200 || input.status === 409) && taskId) {
    return { taskId, phase: 'pending', error: '', namespace, pod };
  }
  const fromBody = typeof record?.error === 'string' ? record.error.trim() : '';
  const error =
    fromBody ||
    (input.status === 502
      ? '應用即時狀態分析服務回應 502 Bad Gateway。'
      : livePodDiagnosticsGateMessage('TRIGGER_FAILED'));
  return { taskId, phase: 'pending', error, namespace, pod };
}

export type LivePodDiagnosticsClick =
  | { kind: 'hint' }
  | { kind: 'open'; taskId: string }
  | { kind: 'trigger' }
  | { kind: 'resolve'; taskId: string };

/** What the action button does for the selected pod. */
export function decideLivePodDiagnosticsClick(input: {
  selectable: boolean;
  inFlight: boolean;
  taskId: string | null;
  phase: LivePodDiagnosticsRowPhase | null;
  armed: boolean;
}): LivePodDiagnosticsClick {
  if (!input.selectable) return { kind: 'hint' };
  if (input.inFlight && input.taskId) return { kind: 'open', taskId: input.taskId };
  if (input.armed || !input.taskId) return { kind: 'trigger' };
  if (input.phase === 'success') return { kind: 'open', taskId: input.taskId };
  if (input.phase === 'failure') return { kind: 'trigger' };
  if (input.phase === null) return { kind: 'resolve', taskId: input.taskId };
  return { kind: 'trigger' };
}

export function trackLivePodReselect(input: {
  armed: ReadonlySet<string>;
  uncheckedIds: ReadonlySet<string>;
  previousIds: readonly string[];
  currentIds: readonly string[];
  podKeyById: (id: string) => string | null;
}): { armed: Set<string>; uncheckedIds: Set<string> } {
  const uncheckedIds = new Set(input.uncheckedIds);
  const armed = new Set(input.armed);
  const current = new Set(input.currentIds);
  for (const id of input.previousIds) {
    if (!current.has(id)) uncheckedIds.add(id);
  }
  for (const id of input.currentIds) {
    if (!uncheckedIds.has(id)) continue;
    uncheckedIds.delete(id);
    const key = input.podKeyById(id);
    if (key) armed.add(key);
  }
  return { armed, uncheckedIds };
}

export function livePodKey(siteId: string, namespace: string, pod: string): string {
  return `${siteId}\u0000${namespace}\u0000${pod}`;
}

/** Store row shown in the window, without the Robusta Action Token. */
export function omitLivePodDiagnosticsSecret(row: unknown): unknown {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  delete copy.token;
  return copy;
}

export function livePodDiagnosticsPhaseLabel(phase: LivePodDiagnosticsRowPhase): string {
  return phase === 'success' ? '成功' : '失敗';
}

export function livePodDiagnosticsWaitingCopy(phase: LivePodDiagnosticsRowPhase, taskId: string): string {
  if (phase !== 'pending') return '';
  return `正在等待 Robusta 寫入結果（task ${taskId}）…`;
}

export type LivePodDiagnosticsReadingField = {
  label: string;
  value: string;
};

export type LivePodDiagnosticsReadingList = {
  label: string;
  values: string[];
};

export type LivePodDiagnosticsReading = {
  conclusion: string | null;
  healthScore: string | null;
  diagnosis: string | null;
  podUrl: string | null;
  resources: LivePodDiagnosticsReadingField[];
  node: LivePodDiagnosticsReadingField[];
  risks: LivePodDiagnosticsReadingList[];
  identity: LivePodDiagnosticsReadingField[];
};

function readingText(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readingList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(readingText).filter((item): item is string => item != null);
  }
  const one = readingText(value);
  return one ? [one] : [];
}

function readingUrl(value: unknown): string | null {
  const text = readingText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return text;
  } catch {
    return null;
  }
}

function parsedDiagnosisStatus(status: unknown): Record<string, unknown> | null {
  if (status && typeof status === 'object' && !Array.isArray(status)) {
    return status as Record<string, unknown>;
  }
  const text = readingText(status);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* status stays the raw diagnosis conclusion */
  }
  return null;
}

function readingFields(
  source: Record<string, unknown>,
  fields: readonly { label: string; key: string }[],
): LivePodDiagnosticsReadingField[] {
  const out: LivePodDiagnosticsReadingField[] = [];
  for (const field of fields) {
    const value = readingText(source[field.key]);
    if (value) out.push({ label: field.label, value });
  }
  return out;
}

/** Diagnosis reading for one retrieved Store row. Identity and raw JSON stay outside this view. */
export function readLivePodDiagnosticsRow(row: unknown): LivePodDiagnosticsReading | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  const status = parsedDiagnosisStatus(record.status);
  const conclusion = status ? readingText(status.status) : readingText(record.status);
  const risks: LivePodDiagnosticsReadingList[] = [];
  const restart = status ? readingText(status.restart_summary) : null;
  if (restart) risks.push({ label: '重啟摘要', values: [restart] });
  const factors = status ? readingList(status.risk_factors) : [];
  if (factors.length) risks.push({ label: '風險因素', values: factors });
  const events = readingList(record.events_summary);
  if (events.length) risks.push({ label: '事件摘要', values: events });
  return {
    conclusion,
    healthScore: status ? readingText(status.health_score) : null,
    diagnosis: readingText(record.ai_diagnosis),
    podUrl: status ? readingUrl(status.pod_url) : null,
    resources: readingFields(record, [
      { label: 'CPU 用量', key: 'cpu_usage' },
      { label: 'CPU 上限', key: 'cpu_limit' },
      { label: 'CPU 一小時趨勢', key: 'cpu_trend_1h' },
      { label: '記憶體用量', key: 'mem_usage' },
      { label: '記憶體上限', key: 'mem_limit' },
      { label: '記憶體一小時趨勢', key: 'mem_trend_1h' },
    ]),
    node: readingFields(record, [
      { label: '節點', key: 'node_name' },
      { label: '節點 CPU', key: 'node_cpu_usage' },
      { label: '節點記憶體', key: 'node_mem_usage' },
    ]),
    risks,
    identity: readingFields(record, [
      { label: '命名空間', key: 'namespace' },
      { label: 'Pod', key: 'pod_name' },
      { label: '容器', key: 'container_name' },
      { label: '告警', key: 'alert_name' },
      { label: '時間', key: 'created_at' },
    ]),
  };
}
