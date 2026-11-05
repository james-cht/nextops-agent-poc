<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { publicHref } from '$lib/kit-public-href';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import {
    PIPELINE_METRICS_WINDOW_OPTIONS,
    getPipelineTimeoutSec,
    type PipelineWindowHours,
  } from '$lib/pipeline-metrics-config';

  interface PipelineSummary {
    appName: string;
    nameSpace: string | null;
    timeoutCount: number;
    totalBuilds: number;
    timeoutRate: number;
    lastTimeoutAt: string | null;
  }

  interface BuildRecord {
    buildNumber: number;
    buildTime: string;
    buildDuration: number;
    buildStatus: string;
    buildUser: string | null;
    projectPath: string | null;
    gitlabUrl: string | null;
    managerEmail: string | null;
    securityTicketNum: string | null;
  }

  let thresholdSec = $state(300);
  let windowHours = $state<PipelineWindowHours>(24);
  let appName = $state('');

  let pipelines = $state<PipelineSummary[]>([]);
  let builds = $state<BuildRecord[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const windowLabel = $derived(`${windowHours} 小時`);

  function syncFromUrl(sp: URLSearchParams) {
    const t = parseInt(sp.get('thresholdSec') ?? '', 10);
    thresholdSec = Number.isFinite(t) && t > 0 ? t : getPipelineTimeoutSec();

    const w = parseInt(sp.get('windowHours') ?? '', 10);
    windowHours = (PIPELINE_METRICS_WINDOW_OPTIONS as readonly number[]).includes(w)
      ? (w as PipelineWindowHours)
      : 24;

    appName = sp.get('appName') ?? '';
  }

  function pageHref(opts?: { clearApp?: boolean; hours?: PipelineWindowHours }): string {
    const params = new URLSearchParams();
    params.set('thresholdSec', String(thresholdSec));
    params.set('windowHours', String(opts?.hours ?? windowHours));
    if (!opts?.clearApp && appName) params.set('appName', appName);
    return `${base}/pipelines/timeouts?${params.toString()}`;
  }

  function buildApiUrl(): string {
    const params = new URLSearchParams();
    params.set('thresholdSec', String(thresholdSec));
    params.set('windowHours', String(windowHours));
    if (appName) params.set('appName', appName);
    return `${base}/api/pipeline-timeouts?${params.toString()}`;
  }

  function formatDateTime(iso: string | null): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  }

  async function loadData() {
    loading = true;
    error = null;
    try {
      const res = await fetch(buildApiUrl());
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      thresholdSec = data.thresholdSec ?? thresholdSec;
      windowHours = data.windowHours ?? windowHours;
      if (appName) {
        builds = data.builds ?? [];
        pipelines = [];
      } else {
        pipelines = data.pipelines ?? [];
        builds = [];
      }
    } catch (e) {
      error = e instanceof Error ? e.message : '載入失敗';
      pipelines = [];
      builds = [];
    } finally {
      loading = false;
    }
  }

  function onWindowChange(hours: PipelineWindowHours) {
    windowHours = hours;
    goto(pageHref({ hours }), { replaceState: true, keepFocus: true });
  }

  function drillToPipeline(name: string) {
    const params = new URLSearchParams();
    params.set('thresholdSec', String(thresholdSec));
    params.set('windowHours', String(windowHours));
    params.set('appName', name);
    goto(publicHref(`/pipelines/timeouts?${params.toString()}`), { keepFocus: true });
  }

  function clearAppFilter() {
    goto(pageHref({ clearApp: true }), { replaceState: true, keepFocus: true });
  }

  $effect(() => {
    const sp = $page.url.searchParams;
    syncFromUrl(sp);
    loadData();
  });
</script>

<div class="mx-auto max-w-6xl space-y-6 p-6">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h1 class="font-semibold text-fg/90" style="font-size: var(--fs-section-title)">流水線逾時分析</h1>
    <a
      href={publicHref('/')}
      class="rounded-lg border border-fg/10 bg-fg/5 px-3 py-1.5 text-fg/60 transition-colors hover:bg-fg/10 hover:text-fg/80"
      style="font-size: var(--fs-small)"
    >
      ← 返回儀表板
    </a>
  </div>

  <div class="filter-banner">
    <span>逾時閾值：<strong>{thresholdSec}</strong> 秒（SRE 設定）</span>
    <span class="filter-sep">·</span>
    <label class="window-control">
      視窗：
      <select
        value={String(windowHours)}
        onchange={(e) => onWindowChange(parseInt(e.currentTarget.value, 10) as PipelineWindowHours)}
      >
        {#each PIPELINE_METRICS_WINDOW_OPTIONS as h}
          <option value={h}>{h} 小時</option>
        {/each}
      </select>
    </label>
    {#if appName}
      <span class="filter-sep">·</span>
      <span>流水線：<strong>{appName}</strong></span>
      <button type="button" class="btn-clear" onclick={clearAppFilter}>返回流水線列表</button>
    {/if}
  </div>

  {#if loading}
    <div class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
  {:else if error}
    <div class="error-panel">
      <p>{error}</p>
      <button type="button" class="btn-retry" onclick={loadData}>重試</button>
    </div>
  {:else if appName}
    {#if builds.length === 0}
      <EmptyState
        title="此視窗內無逾時建置"
        description={`${appName} 在過去 ${windowLabel} 內沒有超過 ${thresholdSec} 秒的建置。`}
        icon="✓"
      />
    {:else}
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>建置編號</th>
              <th>建置時間</th>
              <th>耗時 (秒)</th>
              <th>狀態</th>
              <th>觸發者</th>
              <th>專案路徑</th>
              <th>GitLab</th>
              <th>負責人</th>
              <th>資安單號</th>
            </tr>
          </thead>
          <tbody>
            {#each builds as row (row.buildNumber + row.buildTime)}
              <tr>
                <td class="mono">{row.buildNumber}</td>
                <td>{formatDateTime(row.buildTime)}</td>
                <td class="mono accent-red">{row.buildDuration}</td>
                <td>{row.buildStatus || '—'}</td>
                <td>{row.buildUser || '—'}</td>
                <td class="truncate" title={row.projectPath ?? ''}>{row.projectPath || '—'}</td>
                <td>
                  {#if row.gitlabUrl}
                    <a href={row.gitlabUrl} target="_blank" rel="noopener noreferrer" class="link">開啟</a>
                  {:else}
                    —
                  {/if}
                </td>
                <td class="truncate" title={row.managerEmail ?? ''}>{row.managerEmail || '—'}</td>
                <td>{row.securityTicketNum || '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {:else if pipelines.length === 0}
    <EmptyState
      title="此視窗內無逾時流水線"
      description={`過去 ${windowLabel} 內沒有建置超過 ${thresholdSec} 秒的流水線。`}
      icon="✓"
    />
  {:else}
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>流水線</th>
            <th>命名空間</th>
            <th>逾時次數</th>
            <th>建置總數</th>
            <th>逾時率</th>
            <th>最近逾時</th>
          </tr>
        </thead>
        <tbody>
          {#each pipelines as row (row.appName + (row.nameSpace ?? ''))}
            <tr class="clickable" onclick={() => drillToPipeline(row.appName)}>
              <td class="accent-cyan">{row.appName}</td>
              <td>{row.nameSpace || '—'}</td>
              <td class="mono">{row.timeoutCount}</td>
              <td class="mono">{row.totalBuilds}</td>
              <td class="mono">{row.timeoutRate}%</td>
              <td>{formatDateTime(row.lastTimeoutAt)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .filter-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-radius: 12px;
    border: 1px solid var(--theme-danger-border);
    background: var(--theme-danger-bg);
    color: var(--theme-danger-fg);
    font-size: var(--fs-small);
  }

  .filter-sep { opacity: 0.5; }

  .window-control select {
    margin-left: 4px;
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, var(--theme-fg) 15%, transparent);
    background: var(--theme-input);
    color: var(--theme-fg);
    padding: 4px 8px;
    font-size: var(--fs-small);
  }

  .btn-clear {
    margin-left: auto;
    border-radius: 6px;
    border: none;
    background: var(--theme-danger-bg);
    color: var(--theme-danger-fg);
    padding: 4px 10px;
    font-size: var(--fs-small);
    cursor: pointer;
  }
  .btn-clear:hover { background: color-mix(in srgb, var(--theme-danger) 20%, transparent); }

  .error-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 32px;
    border-radius: 12px;
    border: 1px solid var(--theme-danger-border);
    background: var(--theme-danger-bg);
    color: var(--theme-danger-fg);
    text-align: center;
  }

  .btn-retry {
    border: none;
    border-radius: 6px;
    background: color-mix(in srgb, var(--theme-danger) 20%, transparent);
    color: var(--theme-danger-fg);
    padding: 6px 14px;
    cursor: pointer;
    font-size: var(--fs-small);
  }
  .btn-retry:hover { background: color-mix(in srgb, var(--theme-danger) 35%, transparent); }

  .table-wrap {
    overflow-x: auto;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--theme-fg) 8%, transparent);
    background: var(--theme-table);
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-small);
  }

  .data-table th {
    text-align: left;
    padding: 12px 14px;
    color: color-mix(in srgb, var(--theme-fg) 45%, transparent);
    font-weight: 600;
    border-bottom: 1px solid color-mix(in srgb, var(--theme-fg) 8%, transparent);
    white-space: nowrap;
  }

  .data-table td {
    padding: 11px 14px;
    color: color-mix(in srgb, var(--theme-fg) 80%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--theme-fg) 5%, transparent);
    max-width: 200px;
  }

  .data-table tbody tr:last-child td { border-bottom: none; }

  .data-table tr.clickable {
    cursor: pointer;
    transition: background 0.15s;
  }
  .data-table tr.clickable:hover {
    background: color-mix(in srgb, var(--theme-fg) 4%, transparent);
  }

  .mono { font-variant-numeric: tabular-nums; }
  .accent-red { color: var(--theme-danger); font-weight: 600; }
  .accent-cyan { color: #22d3ee; font-weight: 600; }
  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .link {
    color: var(--theme-info);
    text-decoration: none;
  }
  .link:hover { text-decoration: underline; }
</style>
