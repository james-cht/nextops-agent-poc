import { SITE_CONFIGS } from '$lib/site-config';
import { buildMetricsRequest, explainMetricsFetchFailure, PROMETHEUS_FETCH_TIMEOUT_MS, type QueryMethod } from '$lib/prometheus-query';

export type { QueryMethod } from '$lib/prometheus-query';
export { buildMetricsRequest, explainMetricsFetchFailure } from '$lib/prometheus-query';

export const QUERIES = {
  cpu: '100 - (avg by (cluster,job) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
  memory: '100 * (1 - (sum by (cluster,job) (node_memory_MemFree_bytes{role!="ASIA-Kettle"} + node_memory_Buffers_bytes{role!="ASIA-Kettle"} + node_memory_Cached_bytes{role!="ASIA-Kettle"}) / sum by (cluster,job) (node_memory_MemTotal_bytes{role!="ASIA-Kettle"})))',
  disk: '100 * (sum by (cluster,job) (node_filesystem_size_bytes{fstype!~"tmpfs|fuse.lxcfs|overlay", role!="ASIA-Kettle"} - node_filesystem_free_bytes{fstype!~"tmpfs|fuse.lxcfs|overlay", role!="ASIA-Kettle"}) / sum by (cluster,job) (node_filesystem_size_bytes{fstype!~"tmpfs|fuse.lxcfs|overlay", role!="ASIA-Kettle"}))',
  node_total: 'count by (cluster)(up{job=~"os|node-exporter",rolegroup!="PT-Kettle"})',
  node_online: 'sum by (cluster) (up{job=~"os|node-exporter",rolegroup!="PT-Kettle"} == 1)',
  k8s_node_total: 'count by (cluster)(kube_node_info)',
  k8s_node_ready: 'sum by (cluster)(kube_node_status_condition{condition="Ready", status="true"})',
  k8s_pod_total: 'count by (cluster)(kube_pod_info)',
  k8s_pod_ready: 'sum by (cluster)(kube_pod_status_ready{condition="true"})'
};

export async function fetchMetrics(
  queryUrl: string,
  promql: string,
  customFetch = fetch,
  queryMethod: QueryMethod = 'GET',
) {
  try {
    const { url, init } = buildMetricsRequest(queryUrl, promql, queryMethod);
    const res = await customFetch(url, init);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data?.result ?? [];
  } catch {
    return [];
  }
}

export async function fetchAlerts(alertsUrl: string, customFetch = fetch) {
  try {
    const res = await customFetch(alertsUrl, { signal: AbortSignal.timeout(PROMETHEUS_FETCH_TIMEOUT_MS) });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data?.Alerts ?? [];
  } catch {
    return [];
  }
}

function getClusterTag(siteId: string): string | undefined {
  return SITE_CONFIGS[siteId]?.clusterTag;
}

export function parseMetrics(resultList: any[], targetCluster: string, jobType?: 'K8S' | '節點') {
  if (!resultList?.length) return 0;
  for (const item of resultList) {
    const m = item.metric ?? {};
    const cluster = m.cluster ?? m.kubernetes_cluster;
    if (cluster !== targetCluster) continue;
    const val = parseFloat(item.value?.[1] ?? 0);
    const job = (m.job ?? '').toLowerCase();
    if (!jobType) return Math.round(val);
    if (jobType === 'K8S' && (job.includes('node-exporter') || job.includes('kubernetes'))) return round2(val);
    if (jobType === '節點' && (job === 'os' || !job.includes('node-exporter'))) return round2(val);
  }
  return 0;
}

export function parseAlerts(alertsList: any[], targetCluster: string) {
  const counts = { critical: 0, warning: 0, total: 0 };
  if (!alertsList) return counts;
  for (const a of alertsList) {
    const labels = a.labels ?? {};
    const cluster = labels.cluster ?? labels.kubernetes_cluster;
    if (cluster === targetCluster && a.state === 'firing') {
      const severity = (labels.severity ?? '').toLowerCase();
      if (severity === 'critical') counts.critical++;
      else counts.warning++;
      counts.total++;
    }
  }
  return counts;
}

function round2(n: number) { return Math.round(n * 100) / 100; }

export function getQueryUrl(siteId: string) { return SITE_CONFIGS[siteId]?.queryUrl; }
export function getAlertsUrl(siteId: string) { return SITE_CONFIGS[siteId]?.alertsUrl; }
export { getClusterTag };
