<script lang="ts">
  import { untrack } from 'svelte';
  import { connectAlertStream, alertMatchesFilters, upsertStreamAlert } from '$lib/alert-sse';
  import type { Alert, AlertSummary } from '$lib/alert-manager';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { publicHref } from '$lib/kit-public-href';
  import { formatActiveWindowLabel } from '$lib/alert-active-window';
  import {
    buildAlertFilterSearchParams,
    readAlertFiltersFromSearchParams,
    type AlertListFilterState,
  } from '$lib/alert-list-filters';
  import AlertCard from '$lib/components/AlertCard.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import ErrorMessage from '$lib/components/ErrorMessage.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import siteConfig from '$lib/site-config.json';

  let siteFilter = $state('');
  let severityFilter = $state('');
  let statusFilter = $state('all');
  let searchQuery = $state('');
  let timeRange = $state('all');
  let timeFromParam = $state('');
  let activeFromParam = $state('');
  let activeToParam = $state('');

  let drillDownLabel = $derived(
    activeFromParam && activeToParam
      ? formatActiveWindowLabel(activeFromParam, activeToParam)
      : '',
  );

  let alerts = $state<Alert[]>([]);
  let cursor = $state<string | null>(null);
  let totalCount = $state(0);
  let summary = $state<AlertSummary>({ total: 0, firing: 0, critical: 0, warning: 0, info: 0 });
  let unackedCount = $state(0);

  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state<string | null>(null);
  let expandedId = $state<string | null>(null);
  let sseCleanup: (() => void) | undefined;
  let acking = $state(false);

  const SITE_OPTIONS = Object.entries(siteConfig).map(([label, cfg]) => ({
    label,
    value: cfg.clusterTag,
  }));

  function filterState(): AlertListFilterState {
    return {
      site: siteFilter,
      severity: severityFilter,
      status: statusFilter,
      search: searchQuery,
      timeRange,
      timeFrom: timeFromParam,
      activeFrom: activeFromParam,
      activeTo: activeToParam,
    };
  }

  function applyFilterState(state: AlertListFilterState) {
    siteFilter = state.site;
    severityFilter = state.severity;
    statusFilter = state.status;
    searchQuery = state.search;
    timeRange = state.timeRange;
    timeFromParam = state.timeFrom;
    activeFromParam = state.activeFrom;
    activeToParam = state.activeTo;
  }

  function syncFromUrl(sp: URLSearchParams) {
    applyFilterState(readAlertFiltersFromSearchParams(sp));
  }

  function buildFilterParams(): URLSearchParams {
    return buildAlertFilterSearchParams(filterState());
  }

  function pageHref(): string {
    const q = buildFilterParams().toString();
    return q ? `${base}/alerts?${q}` : `${base}/alerts`;
  }

  function buildApiUrl(cursorVal?: string | null): string {
    const params = buildFilterParams();
    if (cursorVal) params.set('cursor', cursorVal);
    params.set('limit', '50');
    return `${base}/api/alerts?${params.toString()}`;
  }

  function applyFilters() {
    if (timeRange !== 'custom') {
      activeFromParam = '';
      activeToParam = '';
      // Preset / All Time rebuilds timeFrom; drop any stale opaque value.
      timeFromParam = '';
    }
    goto(pageHref(), { replaceState: true, keepFocus: true });
  }

  function clearDrillDown() {
    activeFromParam = '';
    activeToParam = '';
    timeFromParam = '';
    timeRange = 'all';
    goto(pageHref(), { replaceState: true, keepFocus: true });
  }

  function buildQueryUrl(cursorVal?: string | null): string {
    return buildApiUrl(cursorVal);
  }

  async function loadAlerts() {
    loading = true;
    error = null;
    cursor = null;
    try {
      const res = await fetch(buildQueryUrl());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      alerts = data.alerts;
      cursor = data.cursor;
      totalCount = data.total;
      summary = data.summary;
      unackedCount = data.alerts.filter((a: Alert) => a.status === 'firing' && !a.acknowledged).length;
     } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load alerts';
      alerts = [];
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    loadingMore = true;
    try {
      const res = await fetch(buildQueryUrl(cursor));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      alerts = [...alerts, ...data.alerts];
      cursor = data.cursor;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load more';
    } finally {
      loadingMore = false;
    }
  }

  function currentFilters() {
    let timeFromMs: number | undefined;
    let activeFromMs: number | undefined;
    let activeToMs: number | undefined;
    if (activeFromParam && activeToParam) {
      activeFromMs = new Date(activeFromParam).getTime();
      activeToMs = new Date(activeToParam).getTime();
    } else if (timeRange !== 'all' && timeRange !== 'custom') {
      const now = new Date();
      let from: Date;
      switch (timeRange) {
        case '1h': from = new Date(now.getTime() - 3600000); break;
        case '6h': from = new Date(now.getTime() - 21600000); break;
        case '24h': from = new Date(now.getTime() - 86400000); break;
        case '7d': from = new Date(now.getTime() - 604800000); break;
        default: from = new Date(now.getTime() - 86400000);
      }
      timeFromMs = from.getTime();
    }
    return {
      site: siteFilter || undefined,
      severity: severityFilter || undefined,
      status: statusFilter,
      search: searchQuery.trim() || undefined,
      timeFromMs,
      activeFromMs,
      activeToMs,
    };
  }

  function applyStreamAlert(alert: Alert, summaryData: AlertSummary) {
    const matches = alertMatchesFilters(alert, currentFilters());
    const { alerts: nextAlerts, totalDelta } = upsertStreamAlert(alerts, alert, matches);
    alerts = nextAlerts;
    if (totalDelta !== 0) totalCount = Math.max(0, totalCount + totalDelta);
    summary = summaryData;
  }

  function resetFilters() {
    siteFilter = '';
    severityFilter = '';
    statusFilter = 'all';
    searchQuery = '';
    timeRange = 'all';
    timeFromParam = '';
    activeFromParam = '';
    activeToParam = '';
    goto(publicHref('/alerts'), { replaceState: true, keepFocus: true });
  }

  function toggleExpand(alertId: string) {
    expandedId = expandedId === alertId ? null : alertId;
  }

  async function handleAcknowledge(fingerprint: string) {
    acking = true;
    try {
      await fetch('/api/alerts/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint }),
      });
      // Update local state
      const alert = alerts.find(a => a.fingerprint === fingerprint);
      if (alert) alert.acknowledged = true;
    } catch {
      // Silently fail
    } finally {
      acking = false;
    }
  }

  async function acknowledgeAll() {
    acking = true;
    try {
      const res = await fetch('/api/alerts/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      if (res.ok) {
        for (const a of alerts) {
          if (a.status === 'firing') a.acknowledged = true;
        }
      }
    } catch {
      // Silently fail
    } finally {
      acking = false;
    }
  }

  // Compute unacked count from server-authoritative SSE payload
  function syncUnacked(unacked: number) {
    unackedCount = unacked;
  }

  // Fetch must be URL-driven only. If this effect also tracks local filter
  // state (via loadAlerts → buildFilterParams), dropdown bind:value re-runs
  // the effect before goto updates the query string, and syncFromUrl clobbers
  // the new selection — list results no longer match the dropdowns.
  $effect(() => {
    const sp = $page.url.searchParams;
    syncFromUrl(sp);
    untrack(() => {
      void loadAlerts();
    });
  });

  $effect(() => {
    sseCleanup = connectAlertStream(null, {
      onSnapshot(_alertsList: Alert[], summaryData: AlertSummary, unacked: number) {
        summary = summaryData;
        syncUnacked(unacked);
        if (!cursor) loadAlerts();
      },
      onAlert(alert: Alert, summaryData: AlertSummary, unacked: number) {
        applyStreamAlert(alert, summaryData);
        syncUnacked(unacked);
      },
      onAck(fingerprint, summaryData, unacked) {
        summary = summaryData;
        syncUnacked(unacked);
        if (fingerprint) {
          const alert = alerts.find((a) => a.fingerprint === fingerprint);
          if (alert) alert.acknowledged = true;
        } else {
          for (const a of alerts) {
            if (a.status === 'firing') a.acknowledged = true;
          }
        }
      },
    });
    return () => { sseCleanup?.(); };
  });
</script>

<div class="alerts-page">
  <div class="page-header">
    <div class="header-left">
      <h1>告警中心</h1>
      <span class="header-subtitle">Prometheus · ElasticSearch · DiFy Agent 聚合</span>
    </div>
    <div class="header-right">
      {#if unackedCount > 0}
        <span class="unacked-badge">{unackedCount} UNACKED</span>
        <button class="btn-read-all" onclick={acknowledgeAll} disabled={acking}>
          {acking ? '...' : '全部已讀'}
        </button>
      {:else}
        <span class="all-clear">&#10003; 全部已讀</span>
      {/if}
      <a href={publicHref('/')} class="btn-back">&larr; 返回</a>
    </div>
  </div>

  {#if !loading}
  <div class="summary-bar">
    <span class="summary-item critical">&#9679; {summary.critical} Critical</span>
    <span class="summary-item warning">&#9679; {summary.warning} Warning</span>
    <span class="summary-item info">&#9679; {summary.info} Info</span>
    <span class="summary-item total">&#9632; {summary.total} Total</span>
    <span class="summary-item firing">&#9650; {summary.firing} Firing</span>
  </div>
  {/if}

  {#if drillDownLabel}
  <div class="drill-banner">
    <span>檢視時段：{drillDownLabel}（活動中告警）</span>
    <button type="button" class="btn-clear-drill" onclick={clearDrillDown}>清除</button>
  </div>
  {/if}

  <div class="filter-bar">
    <select bind:value={siteFilter} onchange={applyFilters}>
      <option value="">All Sites</option>
      {#each SITE_OPTIONS as opt}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>
    <select bind:value={severityFilter} onchange={applyFilters}>
      <option value="">All Severities</option>
      <option value="critical">Critical</option>
      <option value="warning">Warning</option>
      <option value="info">Info</option>
    </select>
    <select bind:value={statusFilter} onchange={applyFilters}>
      <option value="all">All Status</option>
      <option value="firing">Firing</option>
      <option value="resolved">Resolved</option>
    </select>
    {#if drillDownLabel}
      <span class="filter-time-custom" title="來自告警趨勢圖下鑽">{drillDownLabel}</span>
    {:else}
    <select bind:value={timeRange} onchange={applyFilters}>
      <option value="1h">Last Hour</option>
      <option value="6h">Last 6 Hours</option>
      <option value="24h">Last 24 Hours</option>
      <option value="7d">Last 7 Days</option>
      <option value="all">All Time</option>
    </select>
    {/if}
    <input type="search" placeholder="Search alerts" bind:value={searchQuery}
      onkeydown={(e) => { if (e.key === 'Enter') applyFilters(); }} />
    <button class="btn-secondary" onclick={resetFilters}>Reset</button>
  </div>

  {#if error}
    <ErrorMessage message={error} onRetry={loadAlerts} />
  {/if}

  {#if loading}
    <LoadingSpinner label="Loading alerts..." />
  {:else if alerts.length === 0}
    <EmptyState title="No alerts found" description="No alerts matching your filters." actionLabel="Reset Filters" onAction={resetFilters} />
  {:else}
    <div class="alert-list">
      <div class="alert-count">{totalCount} alert{totalCount !== 1 ? 's' : ''}</div>
      {#each alerts as alert (alert.fingerprint)}
        <AlertCard
          {alert}
          expanded={expandedId === alert.fingerprint}
          onToggle={() => toggleExpand(alert.fingerprint)}
          onAcknowledge={handleAcknowledge}
        />
      {/each}
    </div>

    {#if cursor}
    <div class="load-more">
      <button class="btn-primary" onclick={() => loadMore()} disabled={loadingMore}>
        {loadingMore ? 'Loading...' : 'Load More \u2193'}
      </button>
    </div>
    {/if}
  {/if}
</div>

<style>
  .alerts-page {
    max-width: 900px;
    margin: 0 auto;
    color: var(--theme-fg);
  }

  /* ── Header ── */
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    flex-wrap: wrap;
    gap: 8px;
  }
  .header-left {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }
  .header-left h1 {
    margin: 0;
    font-size: 1.5rem;
    color: var(--theme-fg);
  }
  .header-subtitle {
    font-size: 0.8rem;
    color: color-mix(in srgb, var(--theme-fg) 40%, transparent);
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .unacked-badge {
    background: var(--theme-danger-bg);
    color: var(--theme-danger-fg);
    font-size: 0.78rem;
    font-weight: 700;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--theme-danger);
  }
  .btn-read-all {
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-read-all:hover { background: #1d4ed8; }
  .btn-read-all:disabled { opacity: 0.5; cursor: not-allowed; }
  .all-clear {
    font-size: 0.82rem;
    color: var(--theme-success);
    font-weight: 600;
  }
  .btn-back {
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
    text-decoration: none;
    font-size: 0.85rem;
  }
  .btn-back:hover { color: var(--theme-fg); }

  /* ── Summary Bar ── */
  .summary-bar {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    padding: 10px 16px;
    background: var(--theme-elevated);
    border: 1px solid var(--theme-line);
    border-radius: 8px;
    margin-bottom: 12px;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .summary-item.critical { color: var(--theme-danger-fg); }
  .summary-item.warning { color: var(--theme-warning-fg); }
  .summary-item.info { color: var(--theme-info-fg); }
  .summary-item.total { color: color-mix(in srgb, var(--theme-fg) 55%, transparent); }
  .summary-item.firing { color: var(--theme-danger); }

  .drill-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 10px 14px;
    margin-bottom: 12px;
    background: var(--theme-info-bg);
    border: 1px solid var(--theme-info-border);
    border-radius: 8px;
    font-size: 0.85rem;
    color: var(--theme-info-fg);
  }
  .btn-clear-drill {
    background: transparent;
    border: 1px solid var(--theme-info);
    color: var(--theme-info-fg);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .btn-clear-drill:hover { background: var(--theme-info-bg); }
  .filter-time-custom {
    padding: 6px 10px;
    border: 1px solid color-mix(in srgb, var(--theme-fg) 30%, transparent);
    border-radius: 6px;
    font-size: 0.82rem;
    background: var(--theme-inset);
    color: var(--theme-info-fg);
    white-space: nowrap;
  }

  /* ── Filters ── */
  .filter-bar {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    padding: 10px 14px;
    background: var(--theme-elevated);
    border: 1px solid var(--theme-line);
    border-radius: 8px;
    margin-bottom: 16px;
    align-items: center;
  }
  .filter-bar select, .filter-bar input {
    padding: 6px 10px;
    border: 1px solid color-mix(in srgb, var(--theme-fg) 30%, transparent);
    border-radius: 6px;
    font-size: 0.82rem;
    background: var(--theme-inset);
    color: var(--theme-fg);
  }
  .filter-bar input::placeholder { color: color-mix(in srgb, var(--theme-fg) 40%, transparent); }
  .filter-bar input[type="search"] { flex: 1; min-width: 140px; }

  .btn-secondary {
    padding: 6px 12px;
    font-size: 0.82rem;
    background: var(--theme-line);
    color: var(--theme-fg);
    border: 1px solid color-mix(in srgb, var(--theme-fg) 30%, transparent);
    border-radius: 6px;
    cursor: pointer;
  }
  .btn-secondary:hover { background: color-mix(in srgb, var(--theme-fg) 30%, transparent); }

  .btn-primary {
    padding: 8px 24px;
    font-size: 0.85rem;
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
  .btn-primary:hover { background: #1d4ed8; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .alert-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
  .alert-count { font-size: 0.8rem; color: color-mix(in srgb, var(--theme-fg) 40%, transparent); margin-bottom: 4px; }

  .load-more { text-align: center; padding: 16px; }
</style>
