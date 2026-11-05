<script lang="ts">
  import type { Alert } from '$lib/alert-manager';
  import type { SiteResourceHealth } from '$lib/site-catalog-contract';
  import { formatOffenderValue, primarySaturation, reportIsStale } from '$lib/site-health-brief';
  import { splitDiagnosisAnswer } from '$lib/diagnosis-answer-view';
  import DiagnosisAnswerView from './DiagnosisAnswerView.svelte';

  export type FleetSiteRow = {
    siteId: string;
    title: string;
    cpu: number | null;
    memory: number | null;
    disk: number | null;
    firingCount: number;
    error?: string;
  };

  let {
    bound = false,
    loading = false,
    error = '',
    fleet = [],
    health = null,
    alerts = [],
    report = '',
    reportAt = '',
    metricsAt = '',
    generating = false,
    streaming = false,
    canGenerate = true,
    onSelectSite,
    onGenerate,
  }: {
    bound?: boolean;
    loading?: boolean;
    error?: string;
    fleet?: FleetSiteRow[];
    health?: SiteResourceHealth | null;
    alerts?: Alert[];
    report?: string;
    reportAt?: string;
    metricsAt?: string;
    generating?: boolean;
    streaming?: boolean;
    canGenerate?: boolean;
    onSelectSite?: (siteId: string) => void;
    onGenerate?: () => void;
  } = $props();

  let openSat = $state(true);
  let openTop = $state(true);
  let openAlerts = $state(true);
  let openAppendix = $state(false);

  const stale = $derived(reportIsStale(metricsAt, reportAt));
  const sat = $derived(primarySaturation(health));
  const hotspots = $derived(
    health ? [...health.top.nodes, ...health.top.workloads].slice(0, 8) : [],
  );
  const split = $derived(splitDiagnosisAnswer(report));
  const hasReport = $derived(Boolean(report.trim()) || generating);

  $effect(() => {
    report;
    openAppendix = false;
  });
</script>

{#snippet meter(label: string, value: number | null)}
  <div class="meter">
    <div class="meter-label">
      <span>{label}</span>
      <span>{value == null ? '—' : `${Math.round(value)}%`}</span>
    </div>
    <div class="meter-track">
      <div
        class="meter-fill"
        class:warn={value != null && value >= 70}
        class:hot={value != null && value >= 85}
        style="width: {value == null ? 0 : Math.min(100, value)}%"
      ></div>
    </div>
  </div>
{/snippet}

<div class="brief" class:has-report={bound && hasReport}>
  <div class="brief-header">
    <h3>站點健康簡報</h3>
    {#if bound && canGenerate}
      <button
        type="button"
        class="generate"
        disabled={generating || loading || streaming}
        onclick={() => onGenerate?.()}
      >
        {generating ? '產生中…' : report ? '再次產生報告' : '產生報告'}
      </button>
    {/if}
  </div>

  {#if error}
    <p class="err">{error}</p>
  {/if}

  {#if loading && !bound && fleet.length === 0}
    <p class="muted">載入站點健康…</p>
  {:else if !bound}
    <p class="lede">全站概況（overview）。點選站點可看深入簡報；未綁定不產生 LLM 報告。</p>
    <div class="fleet">
      {#each fleet as row}
        <button type="button" class="fleet-card" onclick={() => onSelectSite?.(row.siteId)}>
          <div class="fleet-title">
            <span>{row.title}</span>
            {#if row.firingCount > 0}
              <span class="badge">{row.firingCount} firing</span>
            {/if}
          </div>
          {#if row.error}
            <p class="err tight">{row.error}</p>
          {:else}
            {@render meter('CPU', row.cpu)}
            {@render meter('MEM', row.memory)}
            {@render meter('DISK', row.disk)}
          {/if}
        </button>
      {/each}
    </div>
  {:else}
    {#if stale}
      <p class="stale">資料已更新，報告可能過時。可再次產生報告。</p>
    {/if}

    <div class="live-brief">
      <details class="block" bind:open={openSat}>
        <summary>資源飽和</summary>
        {#if loading && !health}
          <p class="muted">載入 Site Resource Health…</p>
        {:else}
          {@render meter('CPU', sat.cpu)}
          {@render meter('MEM', sat.memory)}
          {@render meter('DISK', sat.disk)}
          {#if health?.partial}
            <p class="muted">部分序列不可用（partial）。</p>
          {/if}
        {/if}
      </details>

      <details class="block" bind:open={openTop}>
        <summary>資源熱點</summary>
        {#if hotspots.length === 0}
          <p class="muted">目前沒有 top offender。</p>
        {:else}
          <ul class="list">
            {#each hotspots as item}
              <li>
                <span class="kind">{item.kind}</span>
                {item.name}
                <span class="val">{item.metric} {formatOffenderValue(item)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </details>

      <details class="block" bind:open={openAlerts}>
        <summary>Firing 告警（{alerts.length}）</summary>
        {#if alerts.length === 0}
          <p class="muted">目前沒有 firing 告警。</p>
        {:else}
          <ul class="list">
            {#each alerts.slice(0, 12) as alert}
              <li>
                <span class="kind">{(alert.labels.severity ?? 'info').toLowerCase()}</span>
                {alert.labels.alertname ?? 'alert'}
              </li>
            {/each}
          </ul>
        {/if}
      </details>
    </div>

    <div class="report-region">
      <div class="report-label">診斷報告</div>
      {#if generating}
        <p class="muted">正在產生 Diagnosis Answer…</p>
      {:else if !report}
        <p class="muted">尚未產生。按上方「產生報告」會寫入同一條 OPSGPT 對話（右側不顯示該輪）。</p>
      {:else}
        <div class="report-scroll">
          {#if split.summary}
            <DiagnosisAnswerView text={split.summary} />
          {/if}
          {#if split.appendix !== null}
            <button
              type="button"
              class="appendix-toggle"
              aria-expanded={openAppendix}
              onclick={() => (openAppendix = !openAppendix)}
            >
              {openAppendix ? '收合詳細資料' : '顯示詳細資料'}
            </button>
            {#if openAppendix}
              <div class="appendix-body">
                {#if split.appendix}
                  <DiagnosisAnswerView text={split.appendix} />
                {:else}
                  <p class="muted">沒有額外詳細資料。</p>
                {/if}
              </div>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .brief {
    background: var(--theme-elevated);
    border-radius: 12px;
    padding: 16px 18px;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
  }
  .brief-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-shrink: 0;
  }
  .brief-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: var(--theme-fg);
  }
  .generate {
    border: 1px solid var(--theme-info-border);
    background: var(--theme-info-bg);
    color: var(--theme-info);
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .generate:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .lede,
  .muted,
  .err,
  .stale {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    flex-shrink: 0;
  }
  .muted {
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
  }
  .err {
    color: var(--theme-danger);
  }
  .err.tight {
    margin-top: 6px;
  }
  .stale {
    color: #f59e0b;
    background: color-mix(in srgb, #f59e0b 12%, transparent);
    border-radius: 6px;
    padding: 6px 8px;
  }
  .fleet {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
    overflow-y: auto;
    min-height: 0;
    flex: 1 1 auto;
  }
  .fleet-card {
    text-align: left;
    background: var(--theme-inset);
    border: 1px solid var(--theme-line);
    border-radius: 8px;
    padding: 10px;
    color: var(--theme-fg);
    cursor: pointer;
  }
  .fleet-card:hover {
    border-color: color-mix(in srgb, var(--theme-fg) 30%, transparent);
  }
  .fleet-title {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .badge {
    font-size: 10px;
    font-weight: 700;
    color: var(--theme-danger);
  }
  .meter {
    margin-bottom: 6px;
  }
  .meter-label {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: color-mix(in srgb, var(--theme-fg) 70%, transparent);
  }
  .meter-track {
    height: 6px;
    border-radius: 99px;
    background: color-mix(in srgb, var(--theme-fg) 8%, transparent);
    overflow: hidden;
    border: 1px solid var(--theme-line);
  }
  .meter-fill {
    height: 100%;
    background: var(--theme-info);
  }
  .meter-fill.warn {
    background: #f59e0b;
  }
  .meter-fill.hot {
    background: var(--theme-danger);
  }
  .live-brief {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    overflow-y: auto;
  }
  .brief:not(.has-report) .live-brief {
    flex: 1 1 auto;
  }
  .brief.has-report .live-brief {
    flex: 0 1 auto;
    max-height: 38%;
  }
  .block {
    border: 1px solid var(--theme-line);
    border-radius: 8px;
    padding: 6px 10px 8px;
    background: var(--theme-inset);
    flex: 0 0 auto;
  }
  .block summary {
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    color: var(--theme-fg);
  }
  .list {
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
    font-size: 12px;
  }
  .list li {
    display: flex;
    gap: 8px;
    align-items: baseline;
    padding: 3px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--theme-line) 70%, transparent);
  }
  .kind {
    font-size: 10px;
    text-transform: uppercase;
    color: var(--theme-info);
    flex-shrink: 0;
  }
  .val {
    margin-left: auto;
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
  }
  .report-region {
    flex: 1 1 auto;
    min-height: 140px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border: 1px solid var(--theme-line);
    border-radius: 8px;
    padding: 8px 10px 10px;
    background: var(--theme-inset);
  }
  .brief:not(.has-report) .report-region {
    flex: 0 1 auto;
    min-height: 0;
  }
  .report-label {
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .report-scroll {
    min-height: 0;
    flex: 1 1 auto;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .appendix-toggle {
    align-self: flex-start;
    margin-top: 4px;
    border: 1px solid var(--theme-line);
    background: var(--theme-elevated);
    color: var(--theme-fg);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .appendix-body {
    padding-top: 4px;
  }
</style>
