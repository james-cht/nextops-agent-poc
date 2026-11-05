<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { publicHref } from '$lib/kit-public-href';
  import SiteHealthBrief, { type FleetSiteRow } from '$lib/components/ai/SiteHealthBrief.svelte';
  import ChatPanel from '$lib/components/ai/ChatPanel.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import ErrorMessage from '$lib/components/ErrorMessage.svelte';
  import type { Alert } from '$lib/alert-manager';
  import type { SiteResourceHealth } from '$lib/site-catalog-contract';
  import { SITE_HEALTH_REPORT_PROMPT } from '$lib/site-health-brief';
  import { canStartDiagnosisTurn } from '$lib/operator-role';
  import {
    chatWidthCss,
    createPaneMaximizeState,
    isBriefVisible,
    isChatVisible,
    maximizePane,
    restorePanes,
  } from '$lib/pane-maximize';
  import { registerDashboardRefresh, unregisterDashboardRefresh } from '$lib/dashboard-refresh.svelte';
  import { getPromqlConfig, buildPromqlQueryParams } from '$lib/promql-config';

  type SiteOption = { siteId: string; title: string; clusterTag: string };

  let sites = $state<SiteOption[]>([]);
  let siteId = $state('');
  let loadingSites = $state(true);
  let sitesError = $state<string | null>(null);
  let streaming = $state(false);
  let paneState = $state(createPaneMaximizeState(0.38));

  let fleet = $state<FleetSiteRow[]>([]);
  let health = $state<SiteResourceHealth | null>(null);
  let alerts = $state<Alert[]>([]);
  let briefLoading = $state(false);
  let briefError = $state('');
  let metricsAt = $state('');
  let report = $state('');
  let reportAt = $state('');
  let generating = $state(false);
  let awaitingGenerate = $state(false);
  let sendPrompt: ((text: string, opts?: { paint?: boolean }) => void) | null = null;

  const siteName = $derived(sites.find((s) => s.siteId === siteId)?.title || siteId);
  const siteBound = $derived(Boolean(siteId));
  const canDiagnose = $derived(
    $page.data.operator == null
      ? true
      : canStartDiagnosisTurn($page.data.operator.role),
  );

  function clearReport() {
    report = '';
    reportAt = '';
    awaitingGenerate = false;
    generating = false;
  }

  async function syncUrl(nextSiteId: string) {
    const url = new URL($page.url);
    if (nextSiteId) {
      url.searchParams.set('siteId', nextSiteId);
    } else {
      url.searchParams.delete('siteId');
    }
    await goto(`${url.pathname}${url.search}`, { replaceState: true, noScroll: true, keepFocus: true });
  }

  async function onSiteSelect(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    await bindSite(value);
  }

  async function bindSite(next: string) {
    siteId = next;
    clearReport();
    health = null;
    alerts = [];
    await syncUrl(next);
    await loadBrief();
  }

  async function parseErr(res: Response): Promise<string> {
    try {
      const data = await res.json();
      return typeof data.error === 'string' ? data.error : `HTTP ${res.status}`;
    } catch {
      return `HTTP ${res.status}`;
    }
  }

  async function loadFleet(list: SiteOption[]) {
    const queryParams = buildPromqlQueryParams(getPromqlConfig());
    const rows = await Promise.all(
      list.map(async (s) => {
        const res = await fetch(`/api/sites/${encodeURIComponent(s.siteId)}/overview?${queryParams}`);
        if (!res.ok) {
          return {
            siteId: s.siteId,
            title: s.title,
            cpu: null,
            memory: null,
            disk: null,
            firingCount: 0,
            error: await parseErr(res),
          } satisfies FleetSiteRow;
        }
        const data = await res.json();
        const firingCount =
          (data.status?.alerts?.critical ?? 0) + (data.status?.alerts?.warning ?? 0);
        return {
          siteId: s.siteId,
          title: s.title,
          cpu: data.metrics?.K8S?.cpu ?? data.metrics?.節點?.cpu ?? null,
          memory: data.metrics?.K8S?.memory ?? data.metrics?.節點?.memory ?? null,
          disk: data.metrics?.K8S?.disk ?? data.metrics?.節點?.disk ?? null,
          firingCount,
        } satisfies FleetSiteRow;
      }),
    );
    fleet = rows;
    metricsAt = new Date().toISOString();
  }

  async function loadBoundBrief(site: SiteOption) {
    const healthReq = fetch(`/api/sites/${encodeURIComponent(site.siteId)}/resource-health`);
    const alertReq = site.clusterTag
      ? fetch(`/api/alerts?site=${encodeURIComponent(site.clusterTag)}&status=firing&limit=50`)
      : Promise.resolve(null);

    const [healthRes, alertRes] = await Promise.all([healthReq, alertReq]);

    if (healthRes.ok) {
      health = (await healthRes.json()) as SiteResourceHealth;
    } else {
      health = null;
      briefError = await parseErr(healthRes);
    }

    if (alertRes?.ok) {
      const data = await alertRes.json();
      alerts = Array.isArray(data.alerts) ? data.alerts : [];
    } else {
      alerts = [];
    }
    metricsAt = health?.generatedAt || new Date().toISOString();
  }

  async function loadBrief() {
    if (sites.length === 0) return;
    briefLoading = true;
    briefError = '';
    try {
      if (!siteId) {
        await loadFleet(sites);
        health = null;
        alerts = [];
      } else {
        const site = sites.find((s) => s.siteId === siteId);
        if (site) await loadBoundBrief(site);
      }
    } catch (e) {
      briefError = e instanceof Error ? e.message : 'Failed to load Site Health Brief';
    } finally {
      briefLoading = false;
    }
  }

  async function loadSites() {
    loadingSites = true;
    sitesError = null;
    try {
      const res = await fetch('/api/sites');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      sites = (Array.isArray(data) ? data : [])
        .map((s: { siteId?: string; title?: string; clusterTag?: string }) => ({
          siteId: s.siteId || s.title || '',
          title: s.title || s.siteId || '',
          clusterTag: s.clusterTag || '',
        }))
        .filter((s: SiteOption) => s.siteId);

      const fromUrl = $page.url.searchParams.get('siteId') ?? '';
      const nextSiteId = fromUrl && sites.some((s) => s.siteId === fromUrl) ? fromUrl : '';
      if (siteId !== nextSiteId) {
        siteId = nextSiteId;
        clearReport();
      }
      await loadBrief();
    } catch (e) {
      sitesError = e instanceof Error ? e.message : 'Failed to load sites';
    } finally {
      loadingSites = false;
    }
  }

  function generateReport() {
    if (!canDiagnose || !siteId || streaming || !sendPrompt) return;
    awaitingGenerate = true;
    generating = true;
    sendPrompt(SITE_HEALTH_REPORT_PROMPT, { paint: false });
  }

  onMount(() => {
    loadSites();
    registerDashboardRefresh(() => {
      loadBrief();
    });
    return () => unregisterDashboardRefresh();
  });
</script>

<div class="diagnosis-page">
  <header class="diagnosis-header">
    <div class="header-left">
      <span class="status-dot" class:bound={siteBound}>{siteBound ? '🟢' : '⚪'}</span>
      <h1>運維助手</h1>
      <span class="title-separator">·</span>
      <label class="site-picker">
        <span class="picker-label">站點</span>
        <select
          value={siteId}
          onchange={onSiteSelect}
          disabled={streaming || loadingSites}
          aria-label="選擇診斷站點"
        >
          <option value="">未綁定（全站摘要）</option>
          {#each sites as s}
            <option value={s.siteId}>{s.title}</option>
          {/each}
        </select>
      </label>
    </div>
    <div class="header-right">
      <a href={publicHref('/')} class="back-link">← 返回</a>
    </div>
  </header>

  {#if loadingSites}
    <div class="loading-container">
      <LoadingSpinner label="Loading site configuration..." fullPage />
    </div>
  {:else if sitesError}
    <div class="error-container">
      <ErrorMessage message={sitesError} onRetry={loadSites} />
    </div>
  {:else}
    <div class="diagnosis-content split">
      {#if isBriefVisible(paneState)}
        <div class="center-panel" class:maximized={paneState.maximized === 'brief'}>
          <div class="pane-toolbar">
            <span class="pane-label">Site Health Brief</span>
            {#if paneState.maximized === 'brief'}
              <button type="button" onclick={() => (paneState = restorePanes(paneState))}>還原</button>
            {:else}
              <button type="button" onclick={() => (paneState = maximizePane(paneState, 'brief'))}>放大</button>
            {/if}
          </div>
          <SiteHealthBrief
            bound={siteBound}
            loading={briefLoading}
            error={briefError}
            {fleet}
            {health}
            {alerts}
            {report}
            {reportAt}
            {metricsAt}
            {generating}
            {streaming}
            canGenerate={canDiagnose}
            onSelectSite={(id) => bindSite(id)}
            onGenerate={generateReport}
          />
        </div>
      {/if}
      {#if isChatVisible(paneState)}
        <div
          class="chat-panel-wrap"
          class:maximized={paneState.maximized === 'chat'}
          style:width={chatWidthCss(paneState)}
        >
          <div class="pane-toolbar">
            <span class="pane-label">OPSGPT</span>
            {#if paneState.maximized === 'chat'}
              <button type="button" onclick={() => (paneState = restorePanes(paneState))}>還原</button>
            {:else}
              <button type="button" onclick={() => (paneState = maximizePane(paneState, 'chat'))}>放大</button>
            {/if}
          </div>
          <ChatPanel
            {siteId}
            {siteName}
            canStartTurn={canDiagnose}
            onStreamingChange={(v) => (streaming = v)}
            onChatReady={(api) => (sendPrompt = api.sendPrompt)}
            onAssistantComplete={(text) => {
              if (!awaitingGenerate) return;
              awaitingGenerate = false;
              generating = false;
              report = text;
              reportAt = new Date().toISOString();
            }}
            onTurnFailed={() => {
              awaitingGenerate = false;
              generating = false;
            }}
          />
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .diagnosis-page {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 56px);
    background: var(--theme-inset);
    color: var(--theme-fg);
  }
  .diagnosis-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 24px;
    background: var(--theme-elevated);
    border-bottom: 1px solid var(--theme-line);
    flex-shrink: 0;
    gap: 12px;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
  }
  .status-dot {
    font-size: 1rem;
  }
  .header-left h1 {
    font-size: 16px;
    font-weight: 700;
    margin: 0;
    color: var(--theme-fg);
  }
  .title-separator {
    color: color-mix(in srgb, var(--theme-fg) 30%, transparent);
  }
  .site-picker {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .picker-label {
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
  }
  .site-picker select {
    max-width: min(280px, 50vw);
    background: var(--theme-inset);
    color: var(--theme-fg);
    border: 1px solid var(--theme-line);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 13px;
  }
  .site-picker select:disabled {
    opacity: 0.6;
  }
  .header-right .back-link {
    color: var(--theme-info);
    text-decoration: none;
    font-size: 13px;
    font-weight: 600;
  }
  .header-right .back-link:hover {
    text-decoration: underline;
  }
  .loading-container,
  .error-container {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: 24px;
  }
  .diagnosis-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  .center-panel {
    flex: 1;
    padding: 12px 20px 20px;
    overflow: hidden;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .center-panel.maximized {
    flex: 1;
  }
  .chat-panel-wrap {
    padding: 12px 20px 20px;
    flex-shrink: 0;
    border-left: 1px solid var(--theme-line);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .chat-panel-wrap.maximized {
    border-left: none;
    flex: 1;
    width: 100% !important;
  }
  .pane-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .pane-label {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    opacity: 0.55;
  }
  .pane-toolbar button {
    background: var(--theme-elevated);
    border: 1px solid var(--theme-line);
    color: var(--theme-fg);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 0.72rem;
    cursor: pointer;
  }
  .pane-toolbar button:hover {
    border-color: var(--theme-info);
  }
  .chat-panel-wrap :global(.chat-panel),
  .center-panel :global(.brief) {
    flex: 1;
    min-height: 0;
  }
</style>
