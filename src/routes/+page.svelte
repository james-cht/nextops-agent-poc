<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { publicHref } from '$lib/kit-public-href';
  import KpiCard from '$lib/components/KpiCard.svelte';
  import SiteCard from '$lib/components/SiteCard.svelte';
  import AlertTrendChart from '$lib/components/AlertTrendChart.svelte';
  import {
    registerDashboardRefresh,
    unregisterDashboardRefresh,
    refreshDashboardNow,
  } from '$lib/dashboard-refresh.svelte';
  import { getPromqlConfig, buildPromqlQueryParams } from '$lib/promql-config';
  import { buildPipelineMetricsQueryString, buildPipelineTimeoutsHref } from '$lib/pipeline-metrics-config';
  import { presentKpi } from '$lib/global-metrics';
  import { PUBLIC_DEFAULT_PROMETHEUS_URL } from '$env/static/public';

  const kpiIcons = {
    shield: 'M12 3L4 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-8-4z',
    chart: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
    clock: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
    bell: 'M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0',
  };

  interface SiteEntry {
    title: string;
    environment: string;
    error?: string;
    k8sCpu?: number;
    k8sMem?: number;
    k8sDisk?: number;
    nodeCpu?: number;
    nodeMem?: number;
    nodeDisk?: number;
    net?: number;
    osNodesReady?: number;
    osNodesTotal?: number;
    k8sNodesReady?: number;
    k8sNodesTotal?: number;
    podsReady?: number;
    podsTotal?: number;
    alertsCount?: number;
  }

  let sites = $state<SiteEntry[]>([]);
  let loading = $state(true);
  let sitesListError = $state<string | null>(null);
  let loadGen = 0;

  let healthScore = $state<number | null>(null);
  let avgLatency = $state<number | null>(null);
  let healthScoreError = $state<string | null>(null);
  let avgLatencyError = $state<string | null>(null);
  let latencySettled = $state(false);
  const latencyKpi = $derived(presentKpi(avgLatency, avgLatencyError, latencySettled));

  let pipelineSuccessRate = $state<number | null>(null);
  let pipelineTimeoutRate = $state<number | null>(null);
  let pipelineError = $state<string | null>(null);

  let activeErrors = $state<any[]>([]);

  function getPrometheusUrl(): string {
    try {
      const raw = localStorage.getItem('nextops-config');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.prometheus_url) {
          return parsed.prometheus_url.replace(/\/$/, '');
        }
      }
    } catch {}
    return (PUBLIC_DEFAULT_PROMETHEUS_URL ?? 'http://192.0.2.5:20902').replace(/\/$/, '');
  }

  async function parseApiError(res: Response): Promise<string> {
    try {
      const data = await res.json();
      return data.error || `HTTP ${res.status}`;
    } catch {
      return `HTTP ${res.status}`;
    }
  }

  function globalMetricsUrl(kpi: 'health' | 'latency'): string {
    const promBase = getPrometheusUrl();
    return `${base}/api/prometheus/global-metrics?prometheusUrl=${encodeURIComponent(promBase)}&kpi=${kpi}`;
  }

  async function fetchHealthScore(keepPrevious: boolean) {
    try {
      const res = await fetch(globalMetricsUrl('health'));
      if (res.ok) {
        const data = await res.json();
        healthScore = data.healthScore !== undefined ? data.healthScore : null;
        healthScoreError = data.healthScoreError ?? null;
      } else if (!keepPrevious) {
        healthScore = null;
        healthScoreError = await parseApiError(res);
      }
    } catch {
      if (!keepPrevious) {
        healthScore = null;
        healthScoreError = 'Prometheus 連接失敗';
      }
    }
  }

  async function fetchAvgLatency(keepPrevious: boolean) {
    if (!keepPrevious) {
      latencySettled = false;
      avgLatencyError = null;
    }
    try {
      const res = await fetch(globalMetricsUrl('latency'));
      if (res.ok) {
        const data = await res.json();
        avgLatency = data.avgLatency !== undefined && data.avgLatency !== null ? data.avgLatency : null;
        avgLatencyError = data.avgLatencyError ?? (avgLatency === null ? 'Prometheus returned empty data.result' : null);
      } else if (!keepPrevious) {
        avgLatency = null;
        avgLatencyError = await parseApiError(res);
      }
    } catch {
      if (!keepPrevious) {
        avgLatency = null;
        avgLatencyError = 'Prometheus 連接失敗';
      }
    } finally {
      latencySettled = true;
    }
  }

  async function fetchPipelineMetrics(keepPrevious: boolean) {
    try {
      const res = await fetch(`/api/pipeline-metrics?${buildPipelineMetricsQueryString()}`);
      if (res.ok) {
        const data = await res.json();
        pipelineSuccessRate = data.successRate ?? null;
        pipelineTimeoutRate = data.timeoutRate ?? null;
        pipelineError = null;
      } else if (!keepPrevious) {
        pipelineSuccessRate = null;
        pipelineTimeoutRate = null;
        pipelineError = await parseApiError(res);
      }
    } catch {
      if (!keepPrevious) {
        pipelineSuccessRate = null;
        pipelineTimeoutRate = null;
        pipelineError = 'MySQL 連接失敗';
      }
    }
  }

  async function fetchSiteOverview(
    site: { title: string },
    queryParams: string,
  ): Promise<SiteEntry> {
    const res = await fetch(`/api/sites/${encodeURIComponent(site.title)}/overview?${queryParams}`);
    if (!res.ok) {
      return {
        title: site.title,
        environment: '混合環境',
        error: await parseApiError(res),
      };
    }
    const data = await res.json();
    return {
      title: site.title,
      environment: '混合環境',
      k8sCpu: Math.round(data.metrics?.K8S?.cpu ?? 0),
      k8sMem: Math.round(data.metrics?.K8S?.memory ?? 0),
      k8sDisk: Math.round(data.metrics?.K8S?.disk ?? 0),
      nodeCpu: Math.round(data.metrics?.節點?.cpu ?? 0),
      nodeMem: Math.round(data.metrics?.節點?.memory ?? 0),
      nodeDisk: Math.round(data.metrics?.節點?.disk ?? 0),
      net: Math.round(data.metrics?.K8S?.net ?? 0),
      osNodesReady: data.status?.osNodes?.online ?? 0,
      osNodesTotal: data.status?.osNodes?.total ?? 0,
      k8sNodesReady: data.status?.k8sNodes?.online ?? 0,
      k8sNodesTotal: data.status?.k8sNodes?.total ?? 0,
      podsReady: data.status?.pods?.online ?? 0,
      podsTotal: data.status?.pods?.total ?? 0,
      alertsCount: (data.status?.alerts?.critical ?? 0) + (data.status?.alerts?.warning ?? 0),
    };
  }

  function patchSite(entry: SiteEntry, gen: number) {
    if (gen !== loadGen) return;
    const i = sites.findIndex((row) => row.title === entry.title);
    if (i === -1) {
      sites = [...sites, entry];
      return;
    }
    const next = sites.slice();
    next[i] = entry;
    sites = next;
  }

  async function loadSites(opts?: { silent?: boolean }) {
    const gen = ++loadGen;
    const silent = opts?.silent === true;
    const keepPrevious = silent && sites.length > 0;
    if (!keepPrevious) loading = true;
    try {
      fetchHealthScore(keepPrevious);
      fetchAvgLatency(keepPrevious);
      fetchPipelineMetrics(keepPrevious);

      fetch('/api/diagnosis')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) {
            activeErrors = (data.errors ?? []).filter((e: any) => e.status === 'active');
          }
        })
        .catch(() => {});

      const listRes = await fetch('/api/sites');
      if (gen !== loadGen) return;
      if (!listRes.ok) {
        if (!keepPrevious) {
          sitesListError = await parseApiError(listRes);
          sites = [];
        }
        return;
      }

      const list: Array<{ title: string; clusterTag: string }> = await listRes.json();
      if (gen !== loadGen) return;
      sitesListError = null;

      if (!keepPrevious) {
        sites = list.map((s) => ({ title: s.title, environment: '混合環境' }));
        loading = false;
      }

      const promqlConfig = getPromqlConfig();
      const queryParams = buildPromqlQueryParams(promqlConfig);
      await Promise.all(
        list.map(async (s) => {
          const entry = await fetchSiteOverview(s, queryParams);
          patchSite(entry, gen);
        }),
      );
    } catch {
      if (gen !== loadGen) return;
      if (!keepPrevious) {
        sitesListError = 'API 連接失敗';
        sites = [];
      }
    } finally {
      if (gen === loadGen) loading = false;
    }
  }

  onMount(() => {
    registerDashboardRefresh(() => {
      void loadSites({ silent: sites.length > 0 });
    });
    void loadSites({ silent: false });
    return () => unregisterDashboardRefresh();
  });
</script>

<div class="flex flex-col gap-5 p-7">
  {#if activeErrors.length > 0}
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-4 backdrop-blur-md">
      <div class="flex items-start gap-3">
        <div class="mt-0.5 rounded-lg bg-red-500/10 p-1.5 text-red-400">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <div>
          <h4 class="font-semibold text-red-400" style="font-size: var(--fs-body)">
            系統診斷警報: {activeErrors.length} 個服務檢測到異常
          </h4>
          <p class="mt-1 text-fg/60" style="font-size: var(--fs-subtext)">
            受影響服務:
            <span class="font-medium text-red-300">
              {activeErrors.map(e => e.service).join(', ')}
            </span>
          </p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <a href={publicHref('/admin/diagnosis')} class="rounded-lg bg-red-500/20 px-4 py-2 font-medium text-red-200 transition-all hover:bg-red-500/30 hover:scale-[1.02] active:scale-[0.98]" style="font-size: var(--fs-small)">
          查看診斷詳情
        </a>
      </div>
    </div>
  {/if}

  <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
    <KpiCard
      label="服務響應整體健康度"
      value={healthScore !== null ? healthScore : '---'}
      unit={healthScore !== null ? '%' : undefined}
      accent="blue"
      icon={kpiIcons.shield}
      progress={healthScore !== null ? healthScore : undefined}
      error={healthScoreError ?? undefined}
    />
    <KpiCard
      label="服務響應平均延遲"
      value={latencyKpi.value}
      unit={typeof latencyKpi.value === 'number' ? 'ms' : undefined}
      accent="amber"
      icon={kpiIcons.bell}
      progress={typeof latencyKpi.value === 'number' ? Math.max(0, 100 - (latencyKpi.value / 2000) * 100) : undefined}
      error={latencyKpi.error}
    />
    <KpiCard
      label="流水線成功率"
      value={pipelineSuccessRate !== null ? pipelineSuccessRate : '---'}
      unit={pipelineSuccessRate !== null ? '%' : undefined}
      accent="cyan"
      icon={kpiIcons.chart}
      trend={pipelineSuccessRate !== null ? 'up' : undefined}
      progress={pipelineSuccessRate !== null ? pipelineSuccessRate : undefined}
      error={pipelineError ?? undefined}
    />
    <KpiCard
      label="流水線超時率"
      value={pipelineTimeoutRate !== null ? pipelineTimeoutRate : '---'}
      unit={pipelineTimeoutRate !== null ? '%' : undefined}
      accent="red"
      icon={kpiIcons.clock}
      trend={pipelineTimeoutRate !== null ? 'down' : undefined}
      progress={pipelineTimeoutRate !== null ? pipelineTimeoutRate : undefined}
      error={pipelineError ?? undefined}
      href={pipelineTimeoutRate !== null && !pipelineError ? buildPipelineTimeoutsHref({ publicBasePath: base }) : undefined}
    />
  </div>

  <AlertTrendChart />

  <div>
    <div class="mb-4 flex items-center gap-3">
      <h2 class="font-semibold tracking-wide text-fg" style="font-size: var(--fs-section-title)">全球生產設施 · 資源監控</h2>
      <div class="h-px flex-1 bg-line"></div>
      <span class="text-muted" style="font-size: var(--fs-small)">{sites.length} 站點</span>
    </div>

    {#if loading}
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each [1,2,3,4,5,6] as i}
          <div class="h-48 animate-pulse rounded-2xl border border-fg/[0.06] bg-card"></div>
        {/each}
      </div>
    {:else if sitesListError}
      <div class="flex h-40 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-center">
        <div class="flex flex-col items-center gap-2">
          <svg class="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span class="text-red-400" style="font-size: var(--fs-small)">{sitesListError}</span>
          <button onclick={() => { refreshDashboardNow(); }} class="mt-1 rounded-md bg-red-500/20 px-3 py-1 font-medium text-red-200 transition-colors hover:bg-red-500/30" style="font-size: var(--fs-small)">
            重試
          </button>
        </div>
      </div>
    {:else if sites.length === 0}
      <div class="flex h-40 items-center justify-center rounded-2xl border border-fg/[0.06] bg-card p-4 text-center">
        <span class="text-fg/40" style="font-size: var(--fs-small)">無可用站點</span>
      </div>
    {:else}
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each sites as site (site.title)}
          <SiteCard
            title={site.title}
            environment={site.environment}
            k8sCpu={site.k8sCpu ?? 0}
            k8sMem={site.k8sMem ?? 0}
            k8sDisk={site.k8sDisk ?? 0}
            nodeCpu={site.nodeCpu ?? 0}
            nodeMem={site.nodeMem ?? 0}
            nodeDisk={site.nodeDisk ?? 0}
            net={site.net ?? 0}
            osNodesReady={site.osNodesReady ?? 0}
            osNodesTotal={site.osNodesTotal ?? 0}
            k8sNodesReady={site.k8sNodesReady ?? 0}
            k8sNodesTotal={site.k8sNodesTotal ?? 0}
            podsReady={site.podsReady ?? 0}
            podsTotal={site.podsTotal ?? 0}
            alertsCount={site.alertsCount ?? 0}
            error={site.error}
            href={publicHref(`/sites/${encodeURIComponent(site.title)}`)}
          />
        {/each}
      </div>
    {/if}
  </div>
</div>
