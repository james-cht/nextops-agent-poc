import {
  isK8sEventLogSchema,
  parseK8sEventInvestigationId,
  quoteIdent,
  resolveRobustaStoreSchema,
  type RobustaInvestigationStepSchema,
  type RobustaK8sEventLogSchema,
  type RobustaK8sEventSource,
  type RobustaStoreSchema,
} from './robusta-store-schema.ts';
import { ROBUSTA_AUTOSCALE_KIND, ROBUSTA_AUTOSCALE_SUCCESS_STATUS, ROBUSTA_HISTORY_PAGE_SIZE, type RobustaHistoryKindFilter } from '../robusta-history.ts';
import type { RobustaEventFact } from '../robusta-cluster-snapshot.ts';

export interface RobustaInvestigationRow {
  id: string;
  title: string;
  status: string;
  startedAt: string | null;
  stepCount: number;
}

export interface RobustaInvestigationStepRow {
  name: string;
  outcome: string;
  occurredAt: string | null;
}

export type RobustaQueryFn = (sql: string, params: unknown[]) => Promise<unknown[]>;

function toIso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function cell(row: Record<string, unknown>, key: string): unknown {
  return row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()];
}

function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function titleSql(columns: string[]): string {
  if (columns.length === 0) return `''`;
  const parts = columns.map((col) => `NULLIF(TRIM(${quoteIdent(col)}), '')`);
  return `TRIM(CONCAT_WS(' · ', ${parts.join(', ')}))`;
}

function stepCountSql(columns: string[]): string {
  if (columns.length === 0) return '0';
  const parts = columns.map((col) => `(NULLIF(TRIM(${quoteIdent(col)}), '') IS NOT NULL)`);
  return `(${parts.join(' + ')})`;
}

function k8sEventSelectSql(
  source: RobustaK8sEventSource,
  filter: RobustaHistoryKindFilter = null,
): string {
  const table = quoteIdent(source.table);
  const id = quoteIdent(source.id);
  const cluster = quoteIdent(source.clusterKey);
  const started = quoteIdent(source.startedAt);
  const status = source.statusColumn
    ? `IFNULL(TRIM(${quoteIdent(source.statusColumn)}), '')`
    : `''`;
  return `
    SELECT
      CONCAT(${sqlStringLiteral(source.kind)}, ':', CAST(${id} AS CHAR)) AS id,
      ${titleSql(source.titleColumns)} AS title,
      ${status} AS status,
      ${started} AS started_at,
      ${stepCountSql(source.stepColumns)} AS step_count
    FROM ${table}
    WHERE ${cluster} = ?
      AND ${started} >= NOW() - INTERVAL ? HOUR
      ${k8sSuccessWhereSql(source, filter)}
  `;
}

function k8sListSources(
  schema: RobustaK8sEventLogSchema,
  filter: RobustaHistoryKindFilter = null,
): RobustaK8sEventSource[] {
  if (!filter) return schema.sources;
  return schema.sources.filter((source) => source.kind === filter.kind);
}

function k8sSuccessWhereSql(
  source: RobustaK8sEventSource,
  filter: RobustaHistoryKindFilter,
): string {
  if (
    !filter?.cpuSuccess ||
    source.kind !== ROBUSTA_AUTOSCALE_KIND ||
    !source.statusColumn
  ) {
    return '';
  }
  return `AND TRIM(${quoteIdent(source.statusColumn)}) = ?`;
}

function k8sSourceParams(
  source: RobustaK8sEventSource,
  clusterKey: string,
  windowHours: number,
  filter: RobustaHistoryKindFilter = null,
): unknown[] {
  const params: unknown[] = [clusterKey, windowHours];
  if (
    filter?.cpuSuccess &&
    source.kind === ROBUSTA_AUTOSCALE_KIND &&
    source.statusColumn
  ) {
    params.push(ROBUSTA_AUTOSCALE_SUCCESS_STATUS);
  }
  return params;
}

function k8sFilterParams(
  schema: RobustaK8sEventLogSchema,
  clusterKey: string,
  windowHours: number,
  filter: RobustaHistoryKindFilter = null,
): unknown[] {
  const params: unknown[] = [];
  for (const source of k8sListSources(schema, filter)) {
    params.push(...k8sSourceParams(source, clusterKey, windowHours, filter));
  }
  return params;
}

export function buildListInvestigationsSql(
  schema: RobustaStoreSchema,
  filter: RobustaHistoryKindFilter = null,
): string {
  if (isK8sEventLogSchema(schema)) {
    const sources = k8sListSources(schema, filter);
    if (sources.length === 0) return '';
    const unions = sources.map((source) => k8sEventSelectSql(source, filter)).join(' UNION ALL ');
    return `
      SELECT id, title, status, started_at, step_count
      FROM (${unions}) i
      ORDER BY i.started_at DESC
      LIMIT ? OFFSET ?
    `;
  }
  return filter ? '' : buildInvestigationStepListSql(schema);
}

export function buildCountInvestigationsSql(
  schema: RobustaStoreSchema,
  filter: RobustaHistoryKindFilter = null,
): string {
  if (isK8sEventLogSchema(schema)) {
    const sources = k8sListSources(schema, filter);
    if (sources.length === 0) return '';
    const unions = sources
      .map((source) => {
        const table = quoteIdent(source.table);
        const cluster = quoteIdent(source.clusterKey);
        const started = quoteIdent(source.startedAt);
        return `
          SELECT ${quoteIdent(source.id)} AS id
          FROM ${table}
          WHERE ${cluster} = ?
            AND ${started} >= NOW() - INTERVAL ? HOUR
            ${k8sSuccessWhereSql(source, filter)}
        `;
      })
      .join(' UNION ALL ');
    return `
      SELECT COUNT(*) AS total
      FROM (${unions}) x
    `;
  }
  return filter ? '' : buildInvestigationStepCountSql(schema);
}

function buildInvestigationStepListSql(schema: RobustaInvestigationStepSchema): string {
  const t = quoteIdent(schema.investigationTable);
  const s = quoteIdent(schema.stepTable);
  const id = quoteIdent(schema.investigation.id);
  const cluster = quoteIdent(schema.investigation.clusterKey);
  const title = quoteIdent(schema.investigation.title);
  const status = quoteIdent(schema.investigation.status);
  const started = quoteIdent(schema.investigation.startedAt);
  const stepFk = quoteIdent(schema.step.investigationId);
  return `
    SELECT
      i.${id} AS id,
      i.${title} AS title,
      i.${status} AS status,
      i.${started} AS started_at,
      (
        SELECT COUNT(*)
        FROM ${s} st
        WHERE st.${stepFk} = i.${id}
      ) AS step_count
    FROM ${t} i
    WHERE i.${cluster} = ?
      AND i.${started} >= NOW() - INTERVAL ? HOUR
    ORDER BY i.${started} DESC
    LIMIT ? OFFSET ?
  `;
}

function buildInvestigationStepCountSql(schema: RobustaInvestigationStepSchema): string {
  const t = quoteIdent(schema.investigationTable);
  const cluster = quoteIdent(schema.investigation.clusterKey);
  const started = quoteIdent(schema.investigation.startedAt);
  return `
    SELECT COUNT(*) AS total
    FROM ${t} i
    WHERE i.${cluster} = ?
      AND i.${started} >= NOW() - INTERVAL ? HOUR
  `;
}

export function buildListStepsSql(schema: RobustaStoreSchema): string {
  if (isK8sEventLogSchema(schema)) {
    throw new Error('k8s event-log schema uses buildFetchK8sEventRowSql');
  }
  const t = quoteIdent(schema.investigationTable);
  const s = quoteIdent(schema.stepTable);
  const id = quoteIdent(schema.investigation.id);
  const cluster = quoteIdent(schema.investigation.clusterKey);
  const stepFk = quoteIdent(schema.step.investigationId);
  const name = quoteIdent(schema.step.name);
  const outcome = quoteIdent(schema.step.outcome);
  const occurred = quoteIdent(schema.step.occurredAt);
  return `
    SELECT
      st.${name} AS name,
      st.${outcome} AS outcome,
      st.${occurred} AS occurred_at
    FROM ${s} st
    INNER JOIN ${t} i ON i.${id} = st.${stepFk}
    WHERE st.${stepFk} = ?
      AND i.${cluster} = ?
    ORDER BY st.${occurred} ASC
  `;
}

export function buildFetchK8sEventRowSql(source: RobustaK8sEventSource): string {
  const table = quoteIdent(source.table);
  const id = quoteIdent(source.id);
  const cluster = quoteIdent(source.clusterKey);
  const started = quoteIdent(source.startedAt);
  const cols = new Set<string>([source.id, source.clusterKey, source.startedAt, ...source.stepColumns]);
  const selectList = [...cols].map((col) => quoteIdent(col)).join(', ');
  return `
    SELECT ${selectList}
    FROM ${table}
    WHERE ${id} = ?
      AND ${cluster} = ?
    LIMIT 1
  `;
}

export function stepsFromK8sEventRow(
  row: Record<string, unknown> | undefined,
  source: RobustaK8sEventSource,
): RobustaInvestigationStepRow[] {
  if (!row) return [];
  const occurredAt = toIso(cell(row, source.startedAt));
  const steps: RobustaInvestigationStepRow[] = [];
  for (const col of source.stepColumns) {
    const text = String(cell(row, col) ?? '').trim();
    if (!text) continue;
    steps.push({ name: col, outcome: text, occurredAt });
  }
  return steps;
}

function sqlIdentOrEmpty(column: string | null): string {
  return column ? quoteIdent(column) : `''`;
}

function sqlIdentOrNull(column: string | null): string {
  return column ? quoteIdent(column) : 'NULL';
}

function k8sEventFactSelectSql(source: RobustaK8sEventSource): string {
  const table = quoteIdent(source.table);
  const id = quoteIdent(source.id);
  const cluster = quoteIdent(source.clusterKey);
  const started = quoteIdent(source.startedAt);
  const extras: Record<
    string,
    {
      node: string | null;
      restart: string | null;
      exit: string | null;
      usage: string | null;
      safety: string | null;
      memIncrease: string | null;
      memUsage: string | null;
      memLimit: string | null;
      nodeAlloc: string | null;
      nodeReal: string | null;
    }
  > = {
    container_restart: {
      node: null,
      restart: 'restart_count',
      exit: 'exit_code',
      usage: null,
      safety: null,
      memIncrease: null,
      memUsage: null,
      memLimit: null,
      nodeAlloc: null,
      nodeReal: null,
    },
    cpu_autoscale: {
      node: 'node_name',
      restart: null,
      exit: null,
      usage: 'node_usage_pct',
      safety: 'safety_max_limit_m',
      memIncrease: null,
      memUsage: null,
      memLimit: null,
      nodeAlloc: null,
      nodeReal: null,
    },
    memory_diagnose: {
      node: 'node_name',
      restart: null,
      exit: null,
      usage: null,
      safety: null,
      memIncrease: 'mem_increase_1h',
      memUsage: 'mem_usage',
      memLimit: 'mem_limit',
      nodeAlloc: 'node_allocatable',
      nodeReal: 'node_real_usage',
    },
  };
  const extra = extras[source.kind] ?? {
    node: null,
    restart: null,
    exit: null,
    usage: null,
    safety: null,
    memIncrease: null,
    memUsage: null,
    memLimit: null,
    nodeAlloc: null,
    nodeReal: null,
  };
  const status = source.statusColumn ? quoteIdent(source.statusColumn) : `''`;
  return `
    SELECT
      CONCAT(${sqlStringLiteral(source.kind)}, ':', CAST(${id} AS CHAR)) AS id,
      ${sqlStringLiteral(source.kind)} AS kind,
      ${quoteIdent('namespace')} AS namespace,
      ${quoteIdent('pod_name')} AS pod_name,
      ${quoteIdent('container_name')} AS container_name,
      ${sqlIdentOrEmpty(extra.node)} AS node_name,
      ${status} AS status,
      ${started} AS started_at,
      ${sqlIdentOrNull(extra.restart)} AS restart_count,
      ${sqlIdentOrNull(extra.exit)} AS exit_code,
      ${sqlIdentOrNull(extra.usage)} AS node_usage_pct,
      ${sqlIdentOrNull(extra.safety)} AS safety_max_limit_m,
      ${sqlIdentOrEmpty(extra.memIncrease)} AS mem_increase_1h,
      ${sqlIdentOrEmpty(extra.memUsage)} AS mem_usage,
      ${sqlIdentOrEmpty(extra.memLimit)} AS mem_limit,
      ${sqlIdentOrEmpty(extra.nodeAlloc)} AS node_allocatable,
      ${sqlIdentOrEmpty(extra.nodeReal)} AS node_real_usage
    FROM ${table}
    WHERE ${cluster} = ?
      AND ${started} >= NOW() - INTERVAL ? HOUR
  `;
}

export function buildListEventFactsSql(schema: RobustaStoreSchema): string {
  if (!isK8sEventLogSchema(schema)) {
    return '';
  }
  const unions = schema.sources.map((source) => k8sEventFactSelectSql(source)).join(' UNION ALL ');
  return unions;
}

function optionalNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapEventFact(row: Record<string, unknown>): RobustaEventFact {
  return {
    id: String(cell(row, 'id') ?? ''),
    kind: String(cell(row, 'kind') ?? ''),
    namespace: String(cell(row, 'namespace') ?? ''),
    podName: String(cell(row, 'pod_name') ?? ''),
    containerName: String(cell(row, 'container_name') ?? ''),
    nodeName: String(cell(row, 'node_name') ?? ''),
    status: String(cell(row, 'status') ?? ''),
    startedAt: toIso(cell(row, 'started_at')),
    restartCount: optionalNumber(cell(row, 'restart_count')),
    exitCode: optionalNumber(cell(row, 'exit_code')),
    nodeUsagePct: optionalNumber(cell(row, 'node_usage_pct')),
    safetyMaxLimitM: optionalNumber(cell(row, 'safety_max_limit_m')),
    memIncrease1h: String(cell(row, 'mem_increase_1h') ?? ''),
    memUsage: String(cell(row, 'mem_usage') ?? ''),
    memLimit: String(cell(row, 'mem_limit') ?? ''),
    nodeAllocatable: String(cell(row, 'node_allocatable') ?? ''),
    nodeRealUsage: String(cell(row, 'node_real_usage') ?? ''),
  };
}

export async function listRobustaEventFacts(
  opts: {
    clusterKey: string;
    windowHours: number;
    schema?: RobustaStoreSchema;
  },
  queryFn: RobustaQueryFn,
): Promise<RobustaEventFact[]> {
  const schema = opts.schema ?? resolveRobustaStoreSchema();
  if (!isK8sEventLogSchema(schema)) return [];
  const sql = buildListEventFactsSql(schema);
  const rows = (await queryFn(sql, k8sFilterParams(schema, opts.clusterKey, opts.windowHours))) as Array<
    Record<string, unknown>
  >;
  return rows.map(mapEventFact);
}

export async function listRobustaInvestigations(
  opts: {
    clusterKey: string;
    windowHours: number;
    page: number;
    pageSize?: number;
    schema?: RobustaStoreSchema;
    kindFilter?: RobustaHistoryKindFilter;
  },
  queryFn: RobustaQueryFn,
): Promise<{ total: number; items: RobustaInvestigationRow[] }> {
  const schema = opts.schema ?? resolveRobustaStoreSchema();
  const pageSize = opts.pageSize ?? ROBUSTA_HISTORY_PAGE_SIZE;
  const offset = (opts.page - 1) * pageSize;
  const filter = opts.kindFilter ?? null;
  const countSql = buildCountInvestigationsSql(schema, filter);
  const listSql = buildListInvestigationsSql(schema, filter);
  if (!countSql || !listSql) {
    return { total: 0, items: [] };
  }
  const countParams = isK8sEventLogSchema(schema)
    ? k8sFilterParams(schema, opts.clusterKey, opts.windowHours, filter)
    : [opts.clusterKey, opts.windowHours];
  const listParams = isK8sEventLogSchema(schema)
    ? [...k8sFilterParams(schema, opts.clusterKey, opts.windowHours, filter), pageSize, offset]
    : [opts.clusterKey, opts.windowHours, pageSize, offset];
  const countRows = (await queryFn(countSql, countParams)) as Array<Record<string, unknown>>;
  const total = Number(cell(countRows[0] ?? {}, 'total') ?? 0);
  const rows = (await queryFn(listSql, listParams)) as Array<Record<string, unknown>>;
  const items = rows.map((row) => ({
    id: String(cell(row, 'id') ?? ''),
    title: String(cell(row, 'title') ?? ''),
    status: String(cell(row, 'status') ?? ''),
    startedAt: toIso(cell(row, 'started_at')),
    stepCount: Number(cell(row, 'step_count') ?? 0),
  }));
  return { total, items };
}

export async function listRobustaInvestigationSteps(
  opts: {
    investigationId: string;
    clusterKey: string;
    schema?: RobustaStoreSchema;
  },
  queryFn: RobustaQueryFn,
): Promise<RobustaInvestigationStepRow[]> {
  const schema = opts.schema ?? resolveRobustaStoreSchema();
  if (isK8sEventLogSchema(schema)) {
    const parsed = parseK8sEventInvestigationId(opts.investigationId, schema);
    if (!parsed) return [];
    const rows = (await queryFn(buildFetchK8sEventRowSql(parsed.source), [
      parsed.id,
      opts.clusterKey,
    ])) as Array<Record<string, unknown>>;
    return stepsFromK8sEventRow(rows[0], parsed.source);
  }
  const rows = (await queryFn(buildListStepsSql(schema), [
    opts.investigationId,
    opts.clusterKey,
  ])) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    name: String(cell(row, 'name') ?? ''),
    outcome: String(cell(row, 'outcome') ?? ''),
    occurredAt: toIso(cell(row, 'occurred_at')),
  }));
}
