import { SITE_CONFIGS, type SiteConfig } from '$lib/site-config';
import {
  buildSiteDiagnosisContext,
  listSiteCatalogFromConfigs,
  siteCatalogEntryFromConfig,
  type SiteCatalogEntry,
  type SiteDiagnosisContext,
} from '$lib/site-catalog-contract';
import {
  QUERIES,
  explainMetricsFetchFailure,
  fetchAlerts,
  fetchMetrics,
  getAlertsUrl,
  getClusterTag,
  getQueryUrl,
  parseAlerts,
  parseMetrics,
} from '$lib/prometheus';
import { clearError } from '$lib/server/diagnosis';
import { getLogIndexPrefix } from '$lib/server/log-index-resolve';
import { isProxyEnabled } from '$lib/server/proxy';
import { recordUpstreamDiagnostic } from '$lib/server/upstream-diagnostic';

type SnapshotMetricGroup = { cpu: number; memory: number; disk: number };

export interface SiteSnapshot {
  siteId: string;
  title: string;
  clusterId: string;
  metrics: {
    K8S: SnapshotMetricGroup;
    節點: SnapshotMetricGroup;
  };
  status: {
    osNodes: { online: number; total: number };
    k8sNodes: { online: number; total: number };
    pods: { online: number; total: number };
    alerts: { critical: number; warning: number; total: number };
  };
  upstream: {
    prometheus: {
      status: 'healthy' | 'degraded';
      detail?: string;
      proxyEnabled: boolean;
    };
  };
  partial: boolean;
  cached: boolean;
  generatedAt: string;
}

interface SnapshotCacheEntry {
  expiresAt: number;
  snapshot: SiteSnapshot;
}

const DEFAULT_CACHE_TTL_SEC = 15;
const MIN_CACHE_TTL_SEC = 10;
const MAX_CACHE_TTL_SEC = 30;
const SNAPSHOT_CACHE = new Map<string, SnapshotCacheEntry>();

function resolveSnapshotTtlMs() {
  const raw = Number.parseInt(process.env.NEXTOPS_SITE_SNAPSHOT_CACHE_TTL_SEC ?? '', 10);
  const ttlSec = Number.isFinite(raw) ? raw : DEFAULT_CACHE_TTL_SEC;
  const clamped = Math.min(MAX_CACHE_TTL_SEC, Math.max(MIN_CACHE_TTL_SEC, ttlSec));
  return clamped * 1000;
}

function buildSnapshotCacheKey(siteId: string, searchParams: URLSearchParams) {
  const params = new URLSearchParams(searchParams);
  params.sort();
  return `${siteId}?${params.toString()}`;
}

function emptyMetrics(): SiteSnapshot['metrics'] {
  return {
    K8S: { cpu: 0, memory: 0, disk: 0 },
    節點: { cpu: 0, memory: 0, disk: 0 },
  };
}

function emptyStatus(): SiteSnapshot['status'] {
  return {
    osNodes: { online: 0, total: 0 },
    k8sNodes: { online: 0, total: 0 },
    pods: { online: 0, total: 0 },
    alerts: { critical: 0, warning: 0, total: 0 },
  };
}

function baseSnapshot(siteId: string, clusterTag: string): SiteSnapshot {
  return {
    siteId,
    title: siteId,
    clusterId: clusterTag,
    metrics: emptyMetrics(),
    status: emptyStatus(),
    upstream: {
      prometheus: {
        status: 'healthy',
        proxyEnabled: isProxyEnabled(),
      }
    },
    partial: false,
    cached: false,
    generatedAt: new Date().toISOString(),
  };
}

export function listSiteCatalog(): SiteCatalogEntry[] {
  return listSiteCatalogFromConfigs(SITE_CONFIGS);
}

export function getSiteCatalogEntry(siteId: string): SiteCatalogEntry | null {
  const config = SITE_CONFIGS[siteId];
  if (!config) return null;
  return siteCatalogEntryFromConfig(siteId, config);
}

export function getSiteDiagnosisContext(siteId: string): SiteDiagnosisContext | null {
  const catalog = getSiteCatalogEntry(siteId);
  if (!catalog) return null;
  return buildSiteDiagnosisContext(catalog, getLogIndexPrefix());
}

function parseQuery(searchParams: URLSearchParams, key: keyof typeof QUERIES) {
  return searchParams.get(key) || QUERIES[key];
}

async function computeSnapshot(opts: {
  siteId: string;
  config: SiteConfig;
  searchParams: URLSearchParams;
  customFetch: typeof fetch;
  requestId?: string;
}): Promise<SiteSnapshot> {
  const queryUrl = getQueryUrl(opts.siteId);
  const alertsUrl = getAlertsUrl(opts.siteId);
  const clusterTag = getClusterTag(opts.siteId);
  if (!queryUrl || !alertsUrl || !clusterTag) {
    throw new Error('Site config incomplete');
  }

  const snapshot = baseSnapshot(opts.siteId, clusterTag);
  const queryMethod = opts.config.queryMethod ?? 'GET';
  const cpuQuery = parseQuery(opts.searchParams, 'cpu');
  const memoryQuery = parseQuery(opts.searchParams, 'memory');
  const diskQuery = parseQuery(opts.searchParams, 'disk');
  const nodeTotalQuery = parseQuery(opts.searchParams, 'node_total');
  const nodeOnlineQuery = parseQuery(opts.searchParams, 'node_online');
  const k8sNodeTotalQuery = parseQuery(opts.searchParams, 'k8s_node_total');
  const k8sNodeReadyQuery = parseQuery(opts.searchParams, 'k8s_node_ready');
  const k8sPodTotalQuery = parseQuery(opts.searchParams, 'k8s_pod_total');
  const k8sPodReadyQuery = parseQuery(opts.searchParams, 'k8s_pod_ready');

  const [
    cpu, mem, disk, nodeTotal, nodeOnline,
    k8sNodeTotal, k8sNodeReady, k8sPodTotal, k8sPodReady,
    alerts
  ] = await Promise.all([
    fetchMetrics(queryUrl, cpuQuery, opts.customFetch, queryMethod),
    fetchMetrics(queryUrl, memoryQuery, opts.customFetch, queryMethod),
    fetchMetrics(queryUrl, diskQuery, opts.customFetch, queryMethod),
    fetchMetrics(queryUrl, nodeTotalQuery, opts.customFetch, queryMethod),
    fetchMetrics(queryUrl, nodeOnlineQuery, opts.customFetch, queryMethod),
    fetchMetrics(queryUrl, k8sNodeTotalQuery, opts.customFetch, queryMethod),
    fetchMetrics(queryUrl, k8sNodeReadyQuery, opts.customFetch, queryMethod),
    fetchMetrics(queryUrl, k8sPodTotalQuery, opts.customFetch, queryMethod),
    fetchMetrics(queryUrl, k8sPodReadyQuery, opts.customFetch, queryMethod),
    fetchAlerts(alertsUrl, opts.customFetch)
  ]);

  snapshot.metrics = {
    K8S: { cpu: parseMetrics(cpu, clusterTag, 'K8S'), memory: parseMetrics(mem, clusterTag, 'K8S'), disk: parseMetrics(disk, clusterTag, 'K8S') },
    節點: { cpu: parseMetrics(cpu, clusterTag, '節點'), memory: parseMetrics(mem, clusterTag, '節點'), disk: parseMetrics(disk, clusterTag, '節點') },
  };
  snapshot.status = {
    osNodes: { online: parseMetrics(nodeOnline, clusterTag), total: parseMetrics(nodeTotal, clusterTag) },
    k8sNodes: { online: parseMetrics(k8sNodeReady, clusterTag), total: parseMetrics(k8sNodeTotal, clusterTag) },
    pods: { online: parseMetrics(k8sPodReady, clusterTag), total: parseMetrics(k8sPodTotal, clusterTag) },
    alerts: parseAlerts(alerts, clusterTag),
  };

  const hasRealData = cpu.length > 0 || mem.length > 0 || disk.length > 0;
  if (!hasRealData) {
    const failureDetail = await explainMetricsFetchFailure(
      queryUrl,
      cpuQuery,
      opts.customFetch,
      queryMethod,
      { proxyEnabled: isProxyEnabled() },
    );
    snapshot.partial = true;
    snapshot.upstream.prometheus = {
      status: 'degraded',
      detail: failureDetail || 'Prometheus returned no metric data',
      proxyEnabled: isProxyEnabled(),
    };
    recordUpstreamDiagnostic({
      service: `Prometheus (${opts.siteId})`,
      message: 'Prometheus unreachable',
      detail: snapshot.upstream.prometheus.detail,
      requestId: opts.requestId,
      upstreamUrl: queryUrl,
      siteId: opts.siteId,
      dependency: 'Prometheus',
      proxyEnabled: isProxyEnabled(),
    });
    return snapshot;
  }

  clearError(`Prometheus (${opts.siteId})`);
  return snapshot;
}

export async function getSiteSnapshot(opts: {
  siteId: string;
  searchParams: URLSearchParams;
  customFetch?: typeof fetch;
  requestId?: string;
}): Promise<SiteSnapshot | null> {
  const config = SITE_CONFIGS[opts.siteId];
  if (!config) return null;

  const cacheKey = buildSnapshotCacheKey(opts.siteId, opts.searchParams);
  const now = Date.now();
  const cached = SNAPSHOT_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return { ...cached.snapshot, cached: true };
  }

  try {
    const snapshot = await computeSnapshot({
      siteId: opts.siteId,
      config,
      searchParams: opts.searchParams,
      customFetch: opts.customFetch ?? fetch,
      requestId: opts.requestId,
    });
    SNAPSHOT_CACHE.set(cacheKey, {
      snapshot,
      expiresAt: now + resolveSnapshotTtlMs(),
    });
    return snapshot;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const clusterTag = getClusterTag(opts.siteId) ?? opts.siteId;
    const degraded = baseSnapshot(opts.siteId, clusterTag);
    degraded.partial = true;
    degraded.upstream.prometheus = {
      status: 'degraded',
      detail: msg,
      proxyEnabled: isProxyEnabled(),
    };
    recordUpstreamDiagnostic({
      service: `Prometheus (${opts.siteId})`,
      message: msg,
      detail: error instanceof Error ? error.stack : undefined,
      requestId: opts.requestId,
      upstreamUrl: getQueryUrl(opts.siteId),
      siteId: opts.siteId,
      dependency: 'Prometheus',
      proxyEnabled: isProxyEnabled(),
    });
    return degraded;
  }
}
