/**
 * Logical → physical mapping for the Robusta Store.
 * Default: ai-ops k8s event-log tables (cluster_id = Robusta Cluster Key).
 * Override with ROBUSTA_STORE_SCHEMA JSON for an investigation + step table pair.
 */
export interface RobustaInvestigationColumns {
  id: string;
  clusterKey: string;
  title: string;
  status: string;
  startedAt: string;
}

export interface RobustaStepColumns {
  investigationId: string;
  name: string;
  outcome: string;
  occurredAt: string;
}

export interface RobustaInvestigationStepSchema {
  mode: 'investigation_step';
  investigationTable: string;
  stepTable: string;
  investigation: RobustaInvestigationColumns;
  step: RobustaStepColumns;
}

export interface RobustaK8sEventSource {
  kind: string;
  table: string;
  id: string;
  clusterKey: string;
  startedAt: string;
  titleColumns: string[];
  statusColumn: string | null;
  stepColumns: string[];
}

export interface RobustaK8sEventLogSchema {
  mode: 'k8s_event_logs';
  sources: RobustaK8sEventSource[];
}

export type RobustaStoreSchema = RobustaInvestigationStepSchema | RobustaK8sEventLogSchema;

const LEGACY_INVESTIGATION: RobustaInvestigationColumns = {
  id: 'id',
  clusterKey: 'cluster',
  title: 'title',
  status: 'status',
  startedAt: 'created_at',
};

const LEGACY_STEP: RobustaStepColumns = {
  investigationId: 'investigation_id',
  name: 'name',
  outcome: 'status',
  occurredAt: 'created_at',
};

export const DEFAULT_K8S_EVENT_SOURCES: RobustaK8sEventSource[] = [
  {
    kind: 'container_restart',
    table: 'k8s_container_restart_logs',
    id: 'id',
    clusterKey: 'cluster_id',
    startedAt: 'created_at',
    titleColumns: ['alert_name', 'namespace', 'pod_name'],
    statusColumn: 'termination_reason',
    stepColumns: ['ai_diagnosis'],
  },
  {
    kind: 'cpu_autoscale',
    table: 'k8s_cpu_resource_resize_logs',
    id: 'id',
    clusterKey: 'cluster_id',
    startedAt: 'created_at',
    titleColumns: ['namespace', 'pod_name'],
    statusColumn: 'scale_status',
    stepColumns: ['scale_status'],
  },
  {
    kind: 'java_oom',
    table: 'k8s_java_oom_logs',
    id: 'id',
    clusterKey: 'cluster_id',
    startedAt: 'created_at',
    titleColumns: ['alert_name', 'namespace', 'pod_name'],
    statusColumn: null,
    stepColumns: ['ai_diagnosis'],
  },
  {
    kind: 'memory_diagnose',
    table: 'k8s_memory_diagnose_logs',
    id: 'id',
    clusterKey: 'cluster_id',
    startedAt: 'created_at',
    titleColumns: ['alert_name', 'namespace', 'pod_name'],
    statusColumn: null,
    stepColumns: ['ai_diagnosis'],
  },
  {
    kind: 'pod_crash',
    table: 'k8s_pod_crash_logs',
    id: 'id',
    clusterKey: 'cluster_id',
    startedAt: 'created_at',
    titleColumns: ['alert_name', 'namespace', 'pod_name'],
    statusColumn: 'container_status',
    stepColumns: ['ai_diagnosis'],
  },
];

function asIdent(value: unknown, fallback: string): string {
  const s = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : fallback;
}

function asIdentList(value: unknown, fallback: string[]): string[] {
  const raw = Array.isArray(value) ? value : fallback;
  const parsed = raw.map((item) => asIdent(item, '')).filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

function cloneK8sSource(source: RobustaK8sEventSource): RobustaK8sEventSource {
  return {
    ...source,
    titleColumns: [...source.titleColumns],
    stepColumns: [...source.stepColumns],
  };
}

function defaultK8sSchema(): RobustaK8sEventLogSchema {
  return {
    mode: 'k8s_event_logs',
    sources: DEFAULT_K8S_EVENT_SOURCES.map(cloneK8sSource),
  };
}

function defaultInvestigationStepSchema(): RobustaInvestigationStepSchema {
  return {
    mode: 'investigation_step',
    investigationTable: 'investigation',
    stepTable: 'investigation_step',
    investigation: { ...LEGACY_INVESTIGATION },
    step: { ...LEGACY_STEP },
  };
}

function parseK8sSource(raw: unknown, fallback: RobustaK8sEventSource): RobustaK8sEventSource {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const statusRaw = o.statusColumn;
  const statusColumn =
    statusRaw === null || statusRaw === ''
      ? null
      : asIdent(statusRaw, fallback.statusColumn ?? '');
  return {
    kind: asIdent(o.kind, fallback.kind),
    table: asIdent(o.table, fallback.table),
    id: asIdent(o.id, fallback.id),
    clusterKey: asIdent(o.clusterKey, fallback.clusterKey),
    startedAt: asIdent(o.startedAt, fallback.startedAt),
    titleColumns: asIdentList(o.titleColumns, fallback.titleColumns),
    statusColumn: statusColumn || null,
    stepColumns: asIdentList(o.stepColumns, fallback.stepColumns),
  };
}

function parseK8sSchema(raw: Record<string, unknown>): RobustaK8sEventLogSchema {
  const fallbacks = DEFAULT_K8S_EVENT_SOURCES;
  const listed = Array.isArray(raw.sources) ? raw.sources : fallbacks;
  const sources = listed.map((item, i) => parseK8sSource(item, fallbacks[i] ?? fallbacks[0]));
  return { mode: 'k8s_event_logs', sources };
}

function parseInvestigationStepSchema(raw: Record<string, unknown>): RobustaInvestigationStepSchema {
  const base = defaultInvestigationStepSchema();
  const inv =
    raw.investigation && typeof raw.investigation === 'object'
      ? (raw.investigation as Record<string, unknown>)
      : {};
  const step = raw.step && typeof raw.step === 'object' ? (raw.step as Record<string, unknown>) : {};
  return {
    mode: 'investigation_step',
    investigationTable: asIdent(raw.investigationTable, base.investigationTable),
    stepTable: asIdent(raw.stepTable, base.stepTable),
    investigation: {
      id: asIdent(inv.id, base.investigation.id),
      clusterKey: asIdent(inv.clusterKey, base.investigation.clusterKey),
      title: asIdent(inv.title, base.investigation.title),
      status: asIdent(inv.status, base.investigation.status),
      startedAt: asIdent(inv.startedAt, base.investigation.startedAt),
    },
    step: {
      investigationId: asIdent(step.investigationId, base.step.investigationId),
      name: asIdent(step.name, base.step.name),
      outcome: asIdent(step.outcome, base.step.outcome),
      occurredAt: asIdent(step.occurredAt, base.step.occurredAt),
    },
  };
}

export function isK8sEventLogSchema(schema: RobustaStoreSchema): schema is RobustaK8sEventLogSchema {
  return schema.mode === 'k8s_event_logs';
}

export function resolveRobustaStoreSchema(rawJson?: string): RobustaStoreSchema {
  const src = rawJson ?? '';
  if (!src.trim()) return defaultK8sSchema();
  try {
    const parsed = JSON.parse(src) as unknown;
    if (!parsed || typeof parsed !== 'object') return defaultK8sSchema();
    const o = parsed as Record<string, unknown>;
    if (o.mode === 'investigation_step' || o.investigationTable || o.stepTable) {
      return parseInvestigationStepSchema(o);
    }
    if (o.mode === 'k8s_event_logs' || Array.isArray(o.sources)) {
      return parseK8sSchema(o);
    }
    return defaultK8sSchema();
  } catch {
    return defaultK8sSchema();
  }
}

export function parseK8sEventInvestigationId(
  raw: string,
  schema: RobustaK8sEventLogSchema,
): { source: RobustaK8sEventSource; id: string } | null {
  const match = /^([A-Za-z_][A-Za-z0-9_]*):(\d+)$/.exec(raw.trim());
  if (!match) return null;
  const source = schema.sources.find((item) => item.kind === match[1]);
  if (!source) return null;
  return { source, id: match[2] };
}

export function quoteIdent(name: string): string {
  return `\`${name.replace(/`/g, '')}\``;
}
