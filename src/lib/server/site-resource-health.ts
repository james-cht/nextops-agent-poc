import { SITE_CONFIGS, type SiteConfig } from '$lib/site-config';
import {
  buildEmptySiteResourceHealth,
  clampResourceHealthTopN,
  finalizeResourceHealthPartial,
  rankTopOffenders,
  unavailableSection,
  type ResourceHealthSection,
  type ResourceHostType,
  type ResourceMetricKind,
  type ResourceOffenderKind,
  type ResourceSaturation,
  type ResourceTopOffender,
  type SiteResourceHealth,
} from '$lib/site-catalog-contract';
import {
  explainMetricsFetchFailure,
  fetchMetrics,
  getClusterTag,
  getQueryUrl,
  parseMetrics,
  QUERIES,
} from '$lib/prometheus';
import { isProxyEnabled } from '$lib/server/proxy';
import { recordUpstreamDiagnostic } from '$lib/server/upstream-diagnostic';
import { clearError } from '$lib/server/diagnosis';

/** Server-side PromQL defaults for Site Resource Health (not admin-overridable). */
export function buildResourceHealthQueries(topN: number) {
  const n = clampResourceHealthTopN(topN);
  return {
    cpu: QUERIES.cpu,
    memory: QUERIES.memory,
    disk: QUERIES.disk,
    cpu_15m: `100 - (avg by (cluster,job) (irate(node_cpu_seconds_total{mode="idle"}[5m] offset 15m)) * 100)`,
    memory_15m: `100 * (1 - (sum by (cluster,job) (node_memory_MemFree_bytes{role!="ASIA-Kettle"} offset 15m + node_memory_Buffers_bytes{role!="ASIA-Kettle"} offset 15m + node_memory_Cached_bytes{role!="ASIA-Kettle"} offset 15m) / sum by (cluster,job) (node_memory_MemTotal_bytes{role!="ASIA-Kettle"} offset 15m)))`,
    disk_15m: `100 * (sum by (cluster,job) (node_filesystem_size_bytes{fstype!~"tmpfs|fuse.lxcfs|overlay", role!="ASIA-Kettle"} offset 15m - node_filesystem_free_bytes{fstype!~"tmpfs|fuse.lxcfs|overlay", role!="ASIA-Kettle"} offset 15m) / sum by (cluster,job) (node_filesystem_size_bytes{fstype!~"tmpfs|fuse.lxcfs|overlay", role!="ASIA-Kettle"} offset 15m))`,
    cpu_1h: `100 - (avg by (cluster,job) (irate(node_cpu_seconds_total{mode="idle"}[5m] offset 1h)) * 100)`,
    memory_1h: `100 * (1 - (sum by (cluster,job) (node_memory_MemFree_bytes{role!="ASIA-Kettle"} offset 1h + node_memory_Buffers_bytes{role!="ASIA-Kettle"} offset 1h + node_memory_Cached_bytes{role!="ASIA-Kettle"} offset 1h) / sum by (cluster,job) (node_memory_MemTotal_bytes{role!="ASIA-Kettle"} offset 1h)))`,
    disk_1h: `100 * (sum by (cluster,job) (node_filesystem_size_bytes{fstype!~"tmpfs|fuse.lxcfs|overlay", role!="ASIA-Kettle"} offset 1h - node_filesystem_free_bytes{fstype!~"tmpfs|fuse.lxcfs|overlay", role!="ASIA-Kettle"} offset 1h) / sum by (cluster,job) (node_filesystem_size_bytes{fstype!~"tmpfs|fuse.lxcfs|overlay", role!="ASIA-Kettle"} offset 1h))`,

    top_node_cpu: `topk(${n}, 100 - (avg by (instance, cluster, job) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100))`,
    top_node_memory: `topk(${n}, 100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)))`,
    top_node_disk: `topk(${n}, max by (instance, cluster, job) (100 * (1 - node_filesystem_avail_bytes{fstype!~"tmpfs|fuse.lxcfs|overlay"} / node_filesystem_size_bytes{fstype!~"tmpfs|fuse.lxcfs|overlay"})))`,

    top_pod_cpu: `topk(${n}, sum by (namespace, pod, cluster) (rate(container_cpu_usage_seconds_total{container!="",pod!=""}[5m])) * 100)`,
    top_pod_memory: `topk(${n}, sum by (namespace, pod, cluster) (container_memory_working_set_bytes{container!="",pod!=""}))`,
    top_pod_restarts: `topk(${n}, sum by (namespace, pod, cluster) (increase(kube_pod_container_status_restarts_total[1h])))`,
    pod_restarts_total: `sum by (cluster) (increase(kube_pod_container_status_restarts_total[1h]))`,

    top_container_cpu: `topk(${n}, sum by (name, instance, cluster) (rate(container_cpu_usage_seconds_total{name=~".+",name!="POD"}[5m])) * 100)`,
    top_container_memory: `topk(${n}, sum by (name, instance, cluster) (container_memory_working_set_bytes{name=~".+",name!="POD"}))`,
  };
}

type PromResult = {
  metric?: Record<string, string>;
  value?: [number, string];
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function metricValue(item: PromResult): number | null {
  const raw = item.value?.[1];
  if (raw === undefined) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? round2(n) : null;
}

function clusterOf(item: PromResult): string | undefined {
  const m = item.metric ?? {};
  return m.cluster ?? m.kubernetes_cluster;
}

function filterCluster(results: PromResult[], clusterTag: string): PromResult[] {
  return results.filter((item) => clusterOf(item) === clusterTag);
}

function saturationFromAggregates(
  cpu: PromResult[],
  mem: PromResult[],
  disk: PromResult[],
  clusterTag: string,
  jobType: 'K8S' | '節點',
): ResourceSaturation {
  const hasCpu = filterCluster(cpu, clusterTag).length > 0;
  const hasMem = filterCluster(mem, clusterTag).length > 0;
  const hasDisk = filterCluster(disk, clusterTag).length > 0;
  return {
    cpu: hasCpu ? parseMetrics(cpu, clusterTag, jobType) : null,
    memory: hasMem ? parseMetrics(mem, clusterTag, jobType) : null,
    disk: hasDisk ? parseMetrics(disk, clusterTag, jobType) : null,
  };
}

function deltaSaturation(now: ResourceSaturation, then: ResourceSaturation): ResourceSaturation | null {
  if (now.cpu == null && now.memory == null && now.disk == null) return null;
  if (then.cpu == null && then.memory == null && then.disk == null) return null;
  return {
    cpu: now.cpu != null && then.cpu != null ? round2(now.cpu - then.cpu) : null,
    memory: now.memory != null && then.memory != null ? round2(now.memory - then.memory) : null,
    disk: now.disk != null && then.disk != null ? round2(now.disk - then.disk) : null,
  };
}

function saturationAvailable(s: ResourceSaturation | null): boolean {
  if (!s) return false;
  return s.cpu != null || s.memory != null || s.disk != null;
}

function buildSection(
  hostType: ResourceHostType,
  saturation: ResourceSaturation | null,
  deltas: ResourceHealthSection['deltas'],
): ResourceHealthSection {
  if (!saturationAvailable(saturation)) return unavailableSection(hostType);
  return { hostType, available: true, saturation, deltas };
}

function offenderFromResult(
  item: PromResult,
  kind: ResourceOffenderKind,
  metric: ResourceMetricKind,
): ResourceTopOffender | null {
  const value = metricValue(item);
  if (value == null) return null;
  const m = item.metric ?? {};
  let name: string;
  if (kind === 'pod') {
    const ns = m.namespace ?? '';
    const pod = m.pod ?? m.pod_name ?? 'unknown';
    name = ns ? `${ns}/${pod}` : pod;
  } else if (kind === 'container') {
    name = m.name ?? m.container_name ?? m.instance ?? 'unknown';
  } else {
    name = m.instance ?? m.node ?? m.host ?? 'unknown';
  }
  return { name, kind, metric, value, labels: { ...m } };
}

function parseOffenders(
  results: PromResult[],
  clusterTag: string,
  kind: ResourceOffenderKind,
  metric: ResourceMetricKind,
  topN: number,
): ResourceTopOffender[] {
  const offenders: ResourceTopOffender[] = [];
  for (const item of filterCluster(results, clusterTag)) {
    const o = offenderFromResult(item, kind, metric);
    if (o) offenders.push(o);
  }
  return rankTopOffenders(offenders, topN);
}

function sumScalar(results: PromResult[], clusterTag: string): number | null {
  const matched = filterCluster(results, clusterTag);
  if (!matched.length) return null;
  let total = 0;
  for (const item of matched) {
    const v = metricValue(item);
    if (v != null) total += v;
  }
  return round2(total);
}

function isNodeJob(job: string): boolean {
  const j = job.toLowerCase();
  return j === 'os' || (!j.includes('node-exporter') && !j.includes('kubernetes'));
}

function splitNodeOffenders(offenders: ResourceTopOffender[]): {
  baremetal: ResourceTopOffender[];
  vm: ResourceTopOffender[];
  nodes: ResourceTopOffender[];
} {
  const baremetal: ResourceTopOffender[] = [];
  const vm: ResourceTopOffender[] = [];
  const nodes: ResourceTopOffender[] = [];
  for (const o of offenders) {
    const job = (o.labels?.job ?? '').toLowerCase();
    const role = (o.labels?.role ?? '').toLowerCase();
    if (job.includes('vm') || role.includes('vm')) {
      vm.push({ ...o, kind: 'vm' });
    } else if (isNodeJob(job) || job === 'os') {
      baremetal.push(o);
      nodes.push(o);
    } else {
      nodes.push(o);
    }
  }
  return { baremetal, vm, nodes };
}

export async function getSiteResourceHealth(opts: {
  siteId: string;
  topN?: number;
  customFetch?: typeof fetch;
  requestId?: string;
}): Promise<SiteResourceHealth | null> {
  const config: SiteConfig | undefined = SITE_CONFIGS[opts.siteId];
  if (!config) return null;

  const topN = clampResourceHealthTopN(opts.topN);
  const clusterTag = getClusterTag(opts.siteId) ?? config.clusterTag;
  const queryUrl = getQueryUrl(opts.siteId);
  if (!queryUrl) {
    return buildEmptySiteResourceHealth({
      siteId: opts.siteId,
      clusterTag,
      topN,
      warnings: ['Site queryUrl missing'],
    });
  }

  const customFetch = opts.customFetch ?? fetch;
  const queryMethod = config.queryMethod ?? 'GET';
  const q = buildResourceHealthQueries(topN);

  const keys = Object.keys(q) as (keyof typeof q)[];
  const settled = await Promise.all(
    keys.map((key) => fetchMetrics(queryUrl, q[key], customFetch, queryMethod)),
  );
  const byKey = Object.fromEntries(keys.map((key, i) => [key, settled[i] as PromResult[]])) as Record<
    keyof typeof q,
    PromResult[]
  >;

  const anySeries = keys.some((key) => byKey[key].length > 0);
  const health = buildEmptySiteResourceHealth({ siteId: opts.siteId, clusterTag, topN, warnings: [] });

  if (!anySeries) {
    const failureDetail = await explainMetricsFetchFailure(
      queryUrl,
      q.cpu,
      customFetch,
      queryMethod,
      { proxyEnabled: isProxyEnabled() },
    );
    health.warnings.push(failureDetail || 'Prometheus returned no metric data');
    recordUpstreamDiagnostic({
      service: `Prometheus (${opts.siteId})`,
      message: 'Prometheus unreachable for resource-health',
      detail: health.warnings[0],
      requestId: opts.requestId,
      upstreamUrl: queryUrl,
      siteId: opts.siteId,
      dependency: 'Prometheus',
      proxyEnabled: isProxyEnabled(),
    });
    return finalizeResourceHealthPartial(health);
  }

  clearError(`Prometheus (${opts.siteId})`);

  const k8sNow = saturationFromAggregates(byKey.cpu, byKey.memory, byKey.disk, clusterTag, 'K8S');
  const nodeNow = saturationFromAggregates(byKey.cpu, byKey.memory, byKey.disk, clusterTag, '節點');
  const k8s15 = saturationFromAggregates(byKey.cpu_15m, byKey.memory_15m, byKey.disk_15m, clusterTag, 'K8S');
  const node15 = saturationFromAggregates(byKey.cpu_15m, byKey.memory_15m, byKey.disk_15m, clusterTag, '節點');
  const k8s1h = saturationFromAggregates(byKey.cpu_1h, byKey.memory_1h, byKey.disk_1h, clusterTag, 'K8S');
  const node1h = saturationFromAggregates(byKey.cpu_1h, byKey.memory_1h, byKey.disk_1h, clusterTag, '節點');

  const topNodeCpu = parseOffenders(byKey.top_node_cpu, clusterTag, 'node', 'cpu', topN);
  const topNodeMem = parseOffenders(byKey.top_node_memory, clusterTag, 'node', 'memory', topN);
  const topNodeDisk = parseOffenders(byKey.top_node_disk, clusterTag, 'node', 'disk', topN);
  const mergedNodes = rankTopOffenders([...topNodeCpu, ...topNodeMem, ...topNodeDisk], topN);
  const split = splitNodeOffenders(mergedNodes);

  const topPods = rankTopOffenders(
    [
      ...parseOffenders(byKey.top_pod_cpu, clusterTag, 'pod', 'cpu', topN),
      ...parseOffenders(byKey.top_pod_memory, clusterTag, 'pod', 'memory', topN),
    ],
    topN,
  );
  const topContainers = rankTopOffenders(
    [
      ...parseOffenders(byKey.top_container_cpu, clusterTag, 'container', 'cpu', topN),
      ...parseOffenders(byKey.top_container_memory, clusterTag, 'container', 'memory', topN),
    ],
    topN,
  );

  const dockerSat: ResourceSaturation = {
    cpu: topContainers.find((c) => c.metric === 'cpu')?.value ?? null,
    memory: null,
    disk: null,
  };

  // Node-exporter aggregates cover baremetal and VM hosts equally when labels do not split them.
  const nodeDeltas = {
    '15m': deltaSaturation(nodeNow, node15),
    '1h': deltaSaturation(nodeNow, node1h),
  } as const;
  const dockerCpuOnly: ResourceSaturation | null = saturationAvailable(dockerSat) ? dockerSat : null;

  health.sections = [
    buildSection('k8s', k8sNow, {
      '15m': deltaSaturation(k8sNow, k8s15),
      '1h': deltaSaturation(k8sNow, k8s1h),
    }),
    buildSection('baremetal', nodeNow, nodeDeltas),
    buildSection('vm', nodeNow, nodeDeltas),
    buildSection('docker', dockerCpuOnly, null),
  ];

  health.top = {
    nodes: rankTopOffenders([...split.nodes, ...split.vm], topN),
    workloads: rankTopOffenders([...topPods, ...topContainers], topN),
  };

  health.restarts = {
    pods: sumScalar(byKey.pod_restarts_total, clusterTag),
    containers: null,
    top: parseOffenders(byKey.top_pod_restarts, clusterTag, 'pod', 'restarts', topN),
  };

  for (const section of health.sections) {
    if (!section.available) {
      health.warnings.push(`${section.hostType} section: no matching Prometheus series`);
    }
  }

  return finalizeResourceHealthPartial(health);
}
