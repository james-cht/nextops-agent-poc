import type { DefaultLogMode, SiteConfig } from './site-config';

const DEFAULT_LOG_INDEX_PREFIX = 'logs';

/** Keep in sync with `$lib/log-index` `buildLogEsIndices` (ADR-0013). */
function buildLogEsIndices(factoryCode: string, prefix: string = DEFAULT_LOG_INDEX_PREFIX) {
  const pattern = `${prefix}-${factoryCode}-*`;
  const fields = ['@timestamp', 'level', 'message', 'host'];
  return [
    {
      pattern,
      description: `K8s logs for this Site. Default query pattern is logs-{factoryCode}-*. Narrow with Log Namespace / Log Pod document filters (kubernetes.namespace_name / kubernetes.pod_name), not index segments.`,
      fields: [...fields, 'kubernetes.namespace_name', 'kubernetes.pod_name'],
      hostType: 'k8s' as const,
    },
    {
      pattern,
      description: `Non-K8s logs for this Site. Default query pattern is logs-{factoryCode}-* (env equals factoryCode).`,
      fields: [...fields],
      hostType: ['baremetal', 'vm'] as string[],
    },
  ];
}

export interface SiteCatalogEntry {
  siteId: string;
  title: string;
  clusterTag: string;
  factoryCode: string;
  defaultLogMode: DefaultLogMode;
  /** False when Factory Code is missing — Smart Logging / log tools unavailable */
  loggingAvailable: boolean;
  /** Site catalog Robusta Coverage flag. */
  robustaCoverage: boolean;
  /** Robusta Cluster Key; empty means Investigations cannot be listed. */
  robustaClusterKey: string;
  /** Coverage and a non-empty Cluster Key — the page may query the Robusta Store. */
  robustaAvailable: boolean;
}

export interface SiteDiagnosisContext {
  siteId: string;
  clusterTag: string;
  factoryCode: string;
  defaultLogMode: DefaultLogMode;
  hostTypes: string[];
  esIndices: Array<{
    pattern: string;
    description: string;
    fields: string[];
    hostType: string | string[];
  }>;
  prometheusMetrics: string[];
}

export type ResourceHostType = 'k8s' | 'baremetal' | 'vm' | 'docker';
export type ResourceMetricKind = 'cpu' | 'memory' | 'disk' | 'restarts';
export type ResourceOffenderKind = 'node' | 'vm' | 'pod' | 'container';

export interface ResourceSaturation {
  cpu: number | null;
  memory: number | null;
  disk: number | null;
}

export interface ResourceTopOffender {
  name: string;
  kind: ResourceOffenderKind;
  metric: ResourceMetricKind;
  value: number;
  labels?: Record<string, string>;
}

export interface ResourceHealthSection {
  hostType: ResourceHostType;
  available: boolean;
  saturation: ResourceSaturation | null;
  deltas: {
    '15m': ResourceSaturation | null;
    '1h': ResourceSaturation | null;
  } | null;
}

export interface SiteResourceHealth {
  siteId: string;
  clusterTag: string;
  windows: { instant: string; short: string; medium: string };
  topN: number;
  sections: ResourceHealthSection[];
  top: {
    nodes: ResourceTopOffender[];
    workloads: ResourceTopOffender[];
  };
  restarts: {
    pods: number | null;
    containers: number | null;
    top: ResourceTopOffender[];
  };
  partial: boolean;
  warnings: string[];
  generatedAt: string;
}

export const RESOURCE_HEALTH_HOST_TYPES: ResourceHostType[] = ['k8s', 'baremetal', 'vm', 'docker'];
export const RESOURCE_HEALTH_DEFAULT_TOP_N = 5;
export const RESOURCE_HEALTH_MAX_TOP_N = 20;
export const RESOURCE_HEALTH_WINDOWS = {
  instant: '5m',
  short: '15m',
  medium: '1h',
} as const;

const SITE_DESCRIPTION_TEMPLATE = {
  hostTypes: ['k8s', 'baremetal', 'vm'],
  prometheusMetrics: [
    'cpu',
    'memory',
    'disk',
    'node_online',
    'node_total',
    'top_node_cpu',
    'top_pod_cpu',
    'pod_restarts',
  ],
};

export function siteCatalogEntryFromConfig(siteId: string, config: SiteConfig): SiteCatalogEntry {
  const factoryCode = config.factoryCode?.trim() ?? '';
  const robustaClusterKey = config.robustaClusterKey?.trim() ?? '';
  const robustaCoverage = config.robustaCoverage === true;
  return {
    siteId,
    title: siteId,
    clusterTag: config.clusterTag,
    factoryCode,
    defaultLogMode: config.defaultLogMode ?? 'k8s',
    loggingAvailable: factoryCode.length > 0,
    robustaCoverage,
    robustaClusterKey,
    robustaAvailable: robustaCoverage && robustaClusterKey.length > 0,
  };
}

export function listSiteCatalogFromConfigs(configs: Record<string, SiteConfig>): SiteCatalogEntry[] {
  return Object.entries(configs)
    .map(([siteId, config]) => siteCatalogEntryFromConfig(siteId, config))
    .sort((a, b) => a.siteId.localeCompare(b.siteId));
}

export function buildSiteDiagnosisContext(
  entry: SiteCatalogEntry,
  logIndexPrefix: string = DEFAULT_LOG_INDEX_PREFIX,
): SiteDiagnosisContext {
  const factoryCode = entry.factoryCode?.trim() ?? '';
  const esIndices = factoryCode
    ? buildLogEsIndices(factoryCode, logIndexPrefix).map((item) => ({
        pattern: item.pattern,
        description: item.description,
        fields: [...item.fields],
        hostType: Array.isArray(item.hostType) ? [...item.hostType] : item.hostType,
      }))
    : [];

  return {
    siteId: entry.siteId,
    clusterTag: entry.clusterTag,
    factoryCode,
    defaultLogMode: entry.defaultLogMode ?? 'k8s',
    hostTypes: [...SITE_DESCRIPTION_TEMPLATE.hostTypes],
    esIndices,
    prometheusMetrics: [...SITE_DESCRIPTION_TEMPLATE.prometheusMetrics],
  };
}

export function clampResourceHealthTopN(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return RESOURCE_HEALTH_DEFAULT_TOP_N;
  return Math.min(RESOURCE_HEALTH_MAX_TOP_N, Math.max(1, Math.floor(raw)));
}

export function emptySaturation(): ResourceSaturation {
  return { cpu: null, memory: null, disk: null };
}

export function unavailableSection(hostType: ResourceHostType): ResourceHealthSection {
  return {
    hostType,
    available: false,
    saturation: null,
    deltas: null,
  };
}

export function buildEmptySiteResourceHealth(opts: {
  siteId: string;
  clusterTag: string;
  topN?: number;
  warnings?: string[];
}): SiteResourceHealth {
  const topN = clampResourceHealthTopN(opts.topN);
  return {
    siteId: opts.siteId,
    clusterTag: opts.clusterTag,
    windows: { ...RESOURCE_HEALTH_WINDOWS },
    topN,
    sections: RESOURCE_HEALTH_HOST_TYPES.map((hostType) => unavailableSection(hostType)),
    top: { nodes: [], workloads: [] },
    restarts: { pods: null, containers: null, top: [] },
    partial: true,
    warnings: opts.warnings ? [...opts.warnings] : [],
    generatedAt: new Date().toISOString(),
  };
}

/** Rank offenders by value descending and keep top N. */
export function rankTopOffenders(
  offenders: ResourceTopOffender[],
  topN: number,
): ResourceTopOffender[] {
  const n = clampResourceHealthTopN(topN);
  return [...offenders]
    .filter((o) => Number.isFinite(o.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

export function sectionHasData(section: ResourceHealthSection): boolean {
  if (!section.available || !section.saturation) return false;
  const s = section.saturation;
  return s.cpu != null || s.memory != null || s.disk != null;
}

export function finalizeResourceHealthPartial(health: SiteResourceHealth): SiteResourceHealth {
  const anySection = health.sections.some(sectionHasData);
  const anyTop = health.top.nodes.length > 0 || health.top.workloads.length > 0;
  const anyRestarts =
    health.restarts.pods != null ||
    health.restarts.containers != null ||
    health.restarts.top.length > 0;
  const missingSection = health.sections.some((s) => !s.available);
  health.partial = missingSection || (!anySection && !anyTop && !anyRestarts);
  return health;
}
