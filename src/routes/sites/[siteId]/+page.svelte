<script lang="ts">
  import MetricCard from '$lib/components/MetricCard.svelte';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import AlertSummary from '$lib/components/AlertSummary.svelte';
  import NodeStatusGrid from '$lib/components/NodeStatusGrid.svelte';
  import SiteInfoCard from '$lib/components/SiteInfoCard.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import ErrorMessage from '$lib/components/ErrorMessage.svelte';
  import PromqlConfigPanel from '$lib/components/PromqlConfigPanel.svelte';
  import { getPromqlConfig, buildPromqlQueryParams } from '$lib/promql-config';
  import { page } from '$app/stores';

  let siteId = $derived(decodeURIComponent($page.params.siteId ?? ''));

  interface MetricGroup { cpu: number; memory: number; disk: number; }
  interface Overview {
    title: string; clusterId: string;
    metrics: { K8S: MetricGroup; '節點': MetricGroup; };
    status: { online: number; total: number; alerts: { critical: number; warning: number; total: number }; };
  }
  interface SiteInfo {
    siteId: string;
    clusterTag: string;
    factoryCode?: string;
    defaultLogMode?: 'k8s' | 'non_k8s';
    hostTypes: string[];
    esIndices: Array<{ pattern: string; description: string; fields: string[]; hostType: string | string[] }>;
    prometheusMetrics: string[];
  }

  let overview = $state<Overview | null>(null);
  let siteInfo = $state<SiteInfo | null>(null);
  let loadingOverview = $state(true);
  let loadingInfo = $state(true);
  let overviewError = $state<string | null>(null);
  let infoError = $state<string | null>(null);
  let pollInterval = $state(30);
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let showPromqlConfig = $state(false);

  async function loadData() {
    const encoded = encodeURIComponent(siteId);
    overviewError = null;
    loadingOverview = true;
    try {
      const promqlConfig = getPromqlConfig();
      const queryParams = buildPromqlQueryParams(promqlConfig);
      const res = await fetch(`/api/sites/${encoded}/overview?${queryParams}`);
      if (!res.ok) {
        try {
          const data = await res.json();
          throw new Error(data.error || `HTTP ${res.status}`);
        } catch (e) {
          if (e instanceof Error && e.message !== `HTTP ${res.status}`) throw e;
          throw new Error(`HTTP ${res.status}`);
        }
      }
      overview = await res.json();
    } catch (e) {
      overviewError = e instanceof Error ? e.message : '載入指標失敗';
    } finally { loadingOverview = false; }

    infoError = null;
    loadingInfo = true;
    try {
      const res = await fetch(`/api/sites/${encoded}/describe`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      siteInfo = await res.json();
    } catch (e) {
      infoError = e instanceof Error ? e.message : '載入站點資訊失敗';
    } finally { loadingInfo = false; }
  }

  $effect(() => {
    loadData();
    intervalId = setInterval(loadData, pollInterval * 1000);
    return () => { if (intervalId) clearInterval(intervalId); };
  });
</script>

<!-- Header with title and cluster info -->
<SiteHeader {siteId} clusterTag={overview?.clusterId ?? siteInfo?.clusterTag} online={overview?.status.online} total={overview?.status.total} />

<!-- Alert Summary -->
{#if overview}
  <AlertSummary
    critical={overview.status.alerts.critical}
    warning={overview.status.alerts.warning}
    total={overview.status.alerts.total}
    clusterTag={overview.clusterId}
  />
{/if}

<!-- Metrics Section -->
{#if loadingOverview}
  <section>
    <h2 class="section-label">指標</h2>
    <LoadingSpinner label="Loading metrics..." />
  </section>
{:else if overviewError}
  <section>
    <div class="section-header">
      <h2 class="section-label">指標</h2>
      <button
        onclick={() => showPromqlConfig = !showPromqlConfig}
        class="promql-btn"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        PromQL 查詢配置
      </button>
    </div>
    {#if showPromqlConfig}
      <PromqlConfigPanel onSave={loadData} onClose={() => showPromqlConfig = false} />
    {/if}
    <ErrorMessage message={overviewError} onRetry={loadData} />
  </section>
{:else if overview}
  <section>
    <div class="section-header">
      <h2 class="section-label">指標</h2>
      <div class="header-controls">
        <button
          onclick={() => showPromqlConfig = !showPromqlConfig}
          class="promql-btn"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          PromQL 查詢配置
        </button>
        <label class="poll-control">
          自動刷新:
          <select bind:value={pollInterval} onchange={() => {
            if (intervalId) clearInterval(intervalId);
            intervalId = setInterval(loadData, pollInterval * 1000);
          }}>
            <option value={15}>15s</option>
            <option value={30}>30s</option>
            <option value={60}>60s</option>
            <option value={0}>關閉</option>
          </select>
        </label>
      </div>
    </div>
    {#if showPromqlConfig}
      <PromqlConfigPanel onSave={loadData} onClose={() => showPromqlConfig = false} />
    {/if}
    <div class="metric-grid">
      <MetricCard title="Kubernetes (K8S)" metrics={overview.metrics.K8S} />
      <MetricCard title="節點" metrics={overview.metrics['節點']} />
    </div>
  </section>
{/if}

<!-- Node Status -->
{#if overview}
  <section>
    <h2 class="section-label">節點狀態</h2>
    <NodeStatusGrid
      online={overview.status.online}
      total={overview.status.total}
      hostTypes={siteInfo?.hostTypes}
    />
  </section>
{/if}

<!-- Site Information -->
{#if loadingInfo}
  <section>
    <h2 class="section-label">站點資訊</h2>
    <LoadingSpinner label="Loading site info..." />
  </section>
{:else if infoError}
  <section>
    <h2 class="section-label">站點資訊</h2>
    <ErrorMessage message={infoError} onRetry={loadData} />
  </section>
{:else if siteInfo}
  <section>
    <h2 class="section-label">站點資訊</h2>
    <SiteInfoCard
      clusterTag={siteInfo.clusterTag}
      factoryCode={siteInfo.factoryCode}
      defaultLogMode={siteInfo.defaultLogMode}
      esIndices={siteInfo.esIndices}
      prometheusMetrics={siteInfo.prometheusMetrics}
    />
  </section>
{/if}

<style>
  section { margin-bottom: 2rem; }
  .section-label {
    font-size: 1.1rem;
    margin-bottom: 0.75rem;
    color: var(--theme-fg);
    font-weight: 600;
  }
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }
  .section-header .section-label { margin-bottom: 0; }
  .header-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .promql-btn {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: var(--theme-info-bg);
    border: 1px solid var(--theme-info-border);
    color: var(--theme-info);
    padding: 0.35rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .promql-btn:hover {
    background: color-mix(in srgb, var(--theme-info-bg) 80%, var(--theme-info) 20%);
    border-color: var(--theme-info);
    color: var(--theme-info-fg);
  }
  .metric-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  @media (max-width: 768px) {
    .metric-grid { grid-template-columns: 1fr; }
  }
  .poll-control {
    font-size: 0.8rem;
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .poll-control select {
    padding: 0.2rem 0.4rem;
    font-size: 0.8rem;
    background: var(--theme-elevated);
    color: var(--theme-fg);
    border: 1px solid var(--theme-line);
    border-radius: 4px;
  }
</style>
