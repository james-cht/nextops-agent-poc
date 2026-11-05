<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ErrorMessage from '$lib/components/ErrorMessage.svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import GenerateHint from '$lib/components/robusta/GenerateHint.svelte';
  import SnapshotStrip from '$lib/components/robusta/SnapshotStrip.svelte';
  import RobustaReportRegion from '$lib/components/robusta/RobustaReportRegion.svelte';
  import {
    applyAssistantImagesPayload,
    noticeForImageLoadFailure,
    type ChatImageNotice,
  } from '$lib/assistant-chat-view';
  import { splitSuggestionMarker } from '$lib/bounded-log-analysis';
  import { createDifyStream } from '$lib/dify-client';
  import { canStartDiagnosisTurn } from '$lib/operator-role';
  import {
    buildRobustaHistoryReportPrompt,
    canStartRobustaHistoryGenerate,
    type RobustaClusterSnapshot,
    type RobustaEventFact,
  } from '$lib/robusta-cluster-snapshot';
  import {
    DEFAULT_ROBUSTA_HISTORY_WINDOW_HOURS,
    ROBUSTA_HISTORY_PAGE_SIZE,
    ROBUSTA_HISTORY_SITE_STORAGE_KEY,
    ROBUSTA_HISTORY_WINDOW_HOURS,
    pickRobustaHistorySiteId,
    parseRobustaHistoryKindFilter,
    parseRobustaHistoryPage,
    parseRobustaHistoryWindowHours,
    nextRobustaHistoryKindFilter,
    robustaHistoryHref,
    siteHasRobustaHistory,
    type RobustaHistoryKindFilter,
    type RobustaHistoryWindowHours,
  } from '$lib/robusta-history';
  import { base } from '$app/paths';
  import type { SiteCatalogEntry } from '$lib/site-catalog-contract';

  interface InvestigationItem {
    id: string;
    title: string;
    status: string;
    startedAt: string | null;
    stepCount: number;
  }

  interface StepItem {
    name: string;
    outcome: string;
    occurredAt: string | null;
  }

  let sites = $state<SiteCatalogEntry[]>([]);
  let sitesLoaded = $state(false);
  let siteId = $state('');
  let windowHours = $state<RobustaHistoryWindowHours>(DEFAULT_ROBUSTA_HISTORY_WINDOW_HOURS);
  let pageNum = $state(1);
  let kindFilter = $state<RobustaHistoryKindFilter>(null);
  let total = $state(0);
  let items = $state<InvestigationItem[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let errorCode = $state('');
  let expandedId = $state<string | null>(null);
  let stepsById = $state<Record<string, StepItem[]>>({});
  let stepsLoadingId = $state<string | null>(null);
  let stepsErrorById = $state<Record<string, string>>({});

  let snapshot = $state<RobustaClusterSnapshot | null>(null);
  let exemplars = $state<RobustaEventFact[]>([]);
  let snapshotLoading = $state(false);
  let snapshotError = $state<string | null>(null);

  let generating = $state(false);
  let reportError = $state('');
  let reportAnswer = $state('');
  let reportSuggestions = $state<string[]>([]);
  let reportImages = $state<Array<{ url: string }>>([]);
  let reportNotices = $state<ChatImageNotice[]>([]);
  let reportTruncated = $state(false);
  let reportConversationId = $state('');
  let reportStale = $state(false);
  let reportTotalAtGenerate = $state<number | null>(null);
  let reportAbort: { abort: () => void } | undefined;
  let chromeCollapsed = $state(false);

  const selected = $derived(sites.find((s) => s.siteId === siteId) ?? null);
  const covered = $derived(selected ? siteHasRobustaHistory(selected) : false);
  const totalPages = $derived(Math.max(1, Math.ceil(total / ROBUSTA_HISTORY_PAGE_SIZE)));
  const canDiagnose = $derived(
    $page.data.operator == null ? false : canStartDiagnosisTurn($page.data.operator.role),
  );
  const snapshotTotal = $derived(snapshot?.total ?? 0);
  const reportVisible = $derived(
    Boolean(reportAnswer.trim()) || generating || Boolean(reportError),
  );
  const chromeUp = $derived(reportVisible && chromeCollapsed);

  function rememberSite(id: string) {
    if (!browser || !id) return;
    try {
      sessionStorage.setItem(ROBUSTA_HISTORY_SITE_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }

  function rememberedSite(): string {
    if (!browser) return '';
    try {
      return sessionStorage.getItem(ROBUSTA_HISTORY_SITE_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  }

  function hrefFor(opts: {
    siteId?: string;
    windowHours?: number;
    page?: number;
    kindFilter?: RobustaHistoryKindFilter;
  }): string {
    return robustaHistoryHref(base, {
      siteId: opts.siteId ?? siteId,
      windowHours: opts.windowHours ?? windowHours,
      page: opts.page ?? pageNum,
      kindFilter: Object.prototype.hasOwnProperty.call(opts, 'kindFilter')
        ? (opts.kindFilter ?? null)
        : kindFilter,
    });
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

  async function loadSites(): Promise<SiteCatalogEntry[]> {
    const res = await fetch('/api/sites');
    const data = await res.json();
    const list = (Array.isArray(data) ? data : []) as SiteCatalogEntry[];
    sites = list;
    sitesLoaded = true;
    return list;
  }

  function pickSite(list: SiteCatalogEntry[], fromUrl: string): string {
    return pickRobustaHistorySiteId(list, fromUrl, rememberedSite());
  }

  async function loadInvestigations() {
    if (!siteId) return;
    const entry = sites.find((s) => s.siteId === siteId);
    if (!entry || !siteHasRobustaHistory(entry)) {
      items = [];
      total = 0;
      error = null;
      errorCode = '';
      loading = false;
      expandedId = null;
      return;
    }
    loading = true;
    error = null;
    errorCode = '';
    expandedId = null;
    try {
      const params = new URLSearchParams();
      params.set('siteId', siteId);
      params.set('windowHours', String(windowHours));
      params.set('page', String(pageNum));
      if (kindFilter) {
        params.set('kind', kindFilter.kind);
        if (kindFilter.cpuSuccess) params.set('cpuSuccess', '1');
      }
      const res = await fetch(`/api/robusta/investigations?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorCode = data.code ?? '';
        throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`);
      }
      total = Number(data.total ?? 0);
      items = Array.isArray(data.items) ? data.items : [];
      windowHours = parseRobustaHistoryWindowHours(String(data.windowHours ?? windowHours));
      pageNum = parseRobustaHistoryPage(String(data.page ?? pageNum));
    } catch (e) {
      error = e instanceof Error ? e.message : '載入失敗';
      items = [];
      total = 0;
    } finally {
      loading = false;
    }
  }

  function markStaleIfListMovedOn(nextTotal: number) {
    if (reportTotalAtGenerate != null && nextTotal !== reportTotalAtGenerate && reportVisible) {
      reportStale = true;
    }
  }

  async function loadSnapshot() {
    const entry = sites.find((s) => s.siteId === siteId);
    if (!siteId || !entry || !siteHasRobustaHistory(entry)) {
      snapshot = null;
      exemplars = [];
      snapshotError = null;
      snapshotLoading = false;
      return;
    }
    snapshotLoading = true;
    snapshotError = null;
    try {
      const params = new URLSearchParams();
      params.set('siteId', siteId);
      params.set('windowHours', String(windowHours));
      const res = await fetch(`/api/robusta/snapshot?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`);
      }
      snapshot = data.snapshot ?? null;
      exemplars = Array.isArray(data.exemplars) ? data.exemplars : [];
      if (snapshot) markStaleIfListMovedOn(snapshot.total);
    } catch (e) {
      snapshot = null;
      exemplars = [];
      snapshotError = e instanceof Error ? e.message : 'Snapshot 載入失敗';
    } finally {
      snapshotLoading = false;
    }
  }

  function refreshWindow() {
    void loadInvestigations();
    void loadSnapshot();
  }

  function resetReportView() {
    reportAnswer = '';
    reportSuggestions = [];
    reportImages = [];
    reportNotices = [];
    reportTruncated = false;
    reportError = '';
  }

  function clearReport() {
    reportAbort?.abort();
    reportAbort = undefined;
    generating = false;
    reportConversationId = '';
    reportStale = false;
    reportTotalAtGenerate = null;
    chromeCollapsed = false;
    resetReportView();
  }

  function applyReportText(raw: string) {
    const split = splitSuggestionMarker(raw);
    reportAnswer = split.answer;
    reportSuggestions = split.suggestions;
  }

  function runReportTurn(query: string, opts?: { freshConversation?: boolean }) {
    if (!canDiagnose || !siteId || !query.trim()) return;
    reportAbort?.abort();
    generating = true;
    reportError = '';
    resetReportView();
    if (opts?.freshConversation) {
      reportConversationId = '';
    }
    let raw = '';
    reportAbort = createDifyStream({
      query,
      siteId,
      conversationId: opts?.freshConversation ? undefined : reportConversationId || undefined,
      callbacks: {
        onMessage(chunk) {
          raw += chunk;
          applyReportText(raw);
        },
        onAssistantImages(payload) {
          const view = applyAssistantImagesPayload(raw, payload);
          raw = view.content;
          applyReportText(raw);
          reportImages = view.images;
          reportNotices = view.notices;
          reportTruncated = view.truncated;
        },
        onEnd(nextId) {
          generating = false;
          if (nextId) reportConversationId = nextId;
          if (!raw.trim()) {
            reportError = '報告未回傳內容';
          }
        },
        onError(err) {
          generating = false;
          reportError = err || '生成失敗';
        },
      },
    });
  }

  function startGenerate() {
    if (
      !canStartRobustaHistoryGenerate({
        canDiagnose,
        total: snapshotTotal,
        generating,
      }) ||
      !snapshot
    ) {
      return;
    }
    if (reportAnswer || generating || reportConversationId) {
      if (!confirm('開始新的調查建議報告會取代目前報告，確定？')) return;
    }
    reportTotalAtGenerate = snapshot.total;
    reportStale = false;
    chromeCollapsed = true;
    runReportTurn(
      buildRobustaHistoryReportPrompt({
        siteTitle: selected?.title || siteId,
        snapshot,
        exemplars,
      }),
      { freshConversation: true },
    );
  }

  function followUp(question: string) {
    if (!canDiagnose || generating || !question.trim()) return;
    runReportTurn(question.trim());
  }

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      expandedId = null;
      return;
    }
    expandedId = id;
    if (stepsById[id] || stepsLoadingId === id) return;
    stepsLoadingId = id;
    stepsErrorById = { ...stepsErrorById, [id]: '' };
    try {
      const res = await fetch(
        `/api/robusta/investigations/${encodeURIComponent(id)}/steps?siteId=${encodeURIComponent(siteId)}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`);
      }
      stepsById = { ...stepsById, [id]: Array.isArray(data.steps) ? data.steps : [] };
    } catch (e) {
      stepsErrorById = {
        ...stepsErrorById,
        [id]: e instanceof Error ? e.message : '步驟載入失敗',
      };
    } finally {
      stepsLoadingId = null;
    }
  }

  function onSiteChange(next: string) {
    rememberSite(next);
    goto(hrefFor({ siteId: next, page: 1, kindFilter: null }), { replaceState: true, keepFocus: true });
  }

  function onWindowChange(hours: RobustaHistoryWindowHours) {
    goto(hrefFor({ windowHours: hours, page: 1, kindFilter: null }), {
      replaceState: true,
      keepFocus: true,
    });
  }

  function onKindClick(kind: string) {
    const next = nextRobustaHistoryKindFilter(kindFilter, kind);
    goto(hrefFor({ page: 1, kindFilter: next }), { replaceState: true, keepFocus: true });
  }

  function onClearKindFilter() {
    goto(hrefFor({ page: 1, kindFilter: null }), { replaceState: true, keepFocus: true });
  }

  function goPage(next: number) {
    const p = Math.min(totalPages, Math.max(1, next));
    goto(hrefFor({ page: p }), { replaceState: true, keepFocus: true });
  }

  let lastListKey = '';
  let lastSnapKey = '';

  onMount(() => {
    void (async () => {
      const list = await loadSites();
      const fromUrl = $page.url.searchParams.get('siteId')?.trim() ?? '';
      const nextSite = pickSite(list, fromUrl);
      const urlWindow = parseRobustaHistoryWindowHours($page.url.searchParams.get('windowHours'));
      const urlPage = parseRobustaHistoryPage($page.url.searchParams.get('page'));
      const urlFilter = parseRobustaHistoryKindFilter(
        $page.url.searchParams.get('kind'),
        $page.url.searchParams.get('cpuSuccess'),
      );
      siteId = nextSite;
      windowHours = urlWindow;
      pageNum = urlPage;
      kindFilter = urlFilter;
      if (nextSite) rememberSite(nextSite);
      if (nextSite && nextSite !== fromUrl) {
        await goto(
          hrefFor({
            siteId: nextSite,
            windowHours: urlWindow,
            page: urlPage,
            kindFilter: urlFilter,
          }),
          {
            replaceState: true,
            keepFocus: true,
          },
        );
      }
    })();
  });

  $effect(() => {
    if (!sitesLoaded) return;
    const sp = $page.url.searchParams;
    const nextSite = sp.get('siteId')?.trim() ?? '';
    const nextWindow = parseRobustaHistoryWindowHours(sp.get('windowHours'));
    const nextPage = parseRobustaHistoryPage(sp.get('page'));
    const nextFilter = parseRobustaHistoryKindFilter(sp.get('kind'), sp.get('cpuSuccess'));
    const filterKey = nextFilter ? `${nextFilter.kind}:${nextFilter.cpuSuccess ? 1 : 0}` : '';
    const listKey = `${nextSite}|${nextWindow}|${nextPage}|${filterKey}`;
    const snapKey = `${nextSite}|${nextWindow}`;
    if (!nextSite) return;
    if (nextSite !== siteId) {
      stepsById = {};
      stepsErrorById = {};
    }
    siteId = nextSite;
    windowHours = nextWindow;
    pageNum = nextPage;
    kindFilter = nextFilter;
    if (listKey !== lastListKey) {
      lastListKey = listKey;
      void loadInvestigations();
    }
    if (snapKey !== lastSnapKey) {
      if (lastSnapKey) clearReport();
      lastSnapKey = snapKey;
      void loadSnapshot();
    }
  });
</script>

<div class="page" class:has-report={reportVisible} class:chrome-up={chromeUp}>
  <div class="toolbar">
    <div class="group">
      <label for="robusta-site">Site</label>
      <select
        id="robusta-site"
        value={siteId}
        onchange={(e) => onSiteChange(e.currentTarget.value)}
      >
        {#if !siteId}
          <option value="">選擇 Site</option>
        {/if}
        {#each sites as site}
          <option value={site.siteId}>{site.title}</option>
        {/each}
      </select>
    </div>
    <div class="group">
      <label for="robusta-window">時間窗</label>
      <select
        id="robusta-window"
        value={String(windowHours)}
        onchange={(e) =>
          onWindowChange(parseInt(e.currentTarget.value, 10) as RobustaHistoryWindowHours)}
      >
        {#each ROBUSTA_HISTORY_WINDOW_HOURS as h}
          <option value={h}>{h === 168 ? '7 天' : `${h} 小時`}</option>
        {/each}
      </select>
    </div>
    <button type="button" class="ghost" onclick={() => refreshWindow()} disabled={loading || !siteId}>
      重新整理
    </button>
    {#if covered && !error}
      <GenerateHint
        {canDiagnose}
        total={snapshotTotal}
        {generating}
        onGenerate={startGenerate}
      />
    {/if}
    {#if reportVisible}
      <button
        type="button"
        class="ghost rail-toggle"
        aria-expanded={!chromeCollapsed}
        title={chromeCollapsed ? '展開事件種類與熱點工作負載' : '收合上方事件構成，把版面讓給報告'}
        onclick={() => (chromeCollapsed = !chromeCollapsed)}
      >
        {chromeCollapsed ? '展開' : '收合'}
      </button>
    {/if}
  </div>

  {#if covered && !error}
    <div class="ops-chrome" class:is-up={chromeUp}>
      <div class="ops-chrome-inner" inert={chromeUp}>
        {#if snapshot}
          <SnapshotStrip
            {snapshot}
            {kindFilter}
            {onKindClick}
            onClearFilter={onClearKindFilter}
          />
        {:else if snapshotLoading}
          <p class="strip-muted">載入中…</p>
        {:else if snapshotError}
          <p class="strip-error">{snapshotError}</p>
        {/if}
      </div>
    </div>
  {/if}

  {#if !sitesLoaded || (loading && siteId)}
    <div class="center">
      <LoadingSpinner />
    </div>
  {:else if !siteId}
    <EmptyState
      title="請選擇 Site"
      description="此 Session 尚未選定 Site。有 Robusta Coverage 與 Cluster Key 的 Site 才能列出調查。"
      icon="◎"
    />
  {:else if error}
    <ErrorMessage message={error} code={errorCode} onRetry={() => refreshWindow()} />
  {:else if !covered}
    <EmptyState
      title="此 Site 未佈署 Robusta"
      description="Robusta Coverage 未開啟或缺少 Robusta Cluster Key。這不是連線失敗。"
      icon="⊘"
    />
  {:else if items.length === 0 && kindFilter}
    <EmptyState
      title="此篩選沒有調查"
      description="目前 Robusta History Kind Filter 在這段時間窗裡沒有符合的 Investigation。"
      icon="✓"
    />
  {:else if items.length === 0}
    <EmptyState
      title="此時間窗內沒有調查"
      description="有覆蓋的 Site 在這段 Robusta History Window 裡沒有 Investigation。"
      icon="✓"
    />
  {:else}
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th></th>
            <th>時間</th>
            <th>標題</th>
            <th>狀態</th>
            <th>步驟數</th>
          </tr>
        </thead>
        <tbody>
          {#each items as row (row.id)}
            <tr class="clickable" onclick={() => toggleExpand(row.id)}>
              <td class="mono">{expandedId === row.id ? '▾' : '▸'}</td>
              <td class="mono">{formatDateTime(row.startedAt)}</td>
              <td>{row.title || '—'}</td>
              <td>{row.status || '—'}</td>
              <td class="mono">{row.stepCount}</td>
            </tr>
            {#if expandedId === row.id}
              <tr class="steps-row">
                <td colspan="5">
                  {#if stepsLoadingId === row.id}
                    <div class="steps-pad"><LoadingSpinner /></div>
                  {:else if stepsErrorById[row.id]}
                    <ErrorMessage
                      compact
                      message={stepsErrorById[row.id]}
                      onRetry={() => {
                        stepsById = Object.fromEntries(
                          Object.entries(stepsById).filter(([k]) => k !== row.id),
                        );
                        expandedId = null;
                        void toggleExpand(row.id);
                      }}
                    />
                  {:else if (stepsById[row.id] ?? []).length === 0}
                    <p class="steps-empty">沒有調查步驟</p>
                  {:else}
                    <table class="steps-table">
                      <thead>
                        <tr>
                          <th>步驟名</th>
                          <th>結果</th>
                          <th>時間</th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each stepsById[row.id] as step, i (i)}
                          <tr>
                            <td>{step.name || '—'}</td>
                            <td>{step.outcome || '—'}</td>
                            <td class="mono">{formatDateTime(step.occurredAt)}</td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  {/if}
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
    <div class="pager">
      <button type="button" class="ghost" disabled={pageNum <= 1} onclick={() => goPage(pageNum - 1)}>
        上一頁
      </button>
      <span>第 {pageNum} / {totalPages} 頁 · 共 {total} 筆</span>
      <button
        type="button"
        class="ghost"
        disabled={pageNum >= totalPages}
        onclick={() => goPage(pageNum + 1)}
      >
        下一頁
      </button>
    </div>
  {/if}

  {#if reportVisible}
    <RobustaReportRegion
      streaming={generating}
      error={reportError}
      answer={reportAnswer}
      suggestions={reportSuggestions}
      images={reportImages}
      notices={reportNotices}
      truncated={reportTruncated}
      stale={reportStale}
      canFollowUp={canDiagnose}
      onSuggestion={followUp}
      onFollowUp={followUp}
      onImageLoadFailed={(url) => {
        reportImages = reportImages.filter((img) => img.url !== url);
        reportNotices = [...reportNotices, noticeForImageLoadFailure(url)];
      }}
    />
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 100%;
    min-height: 0;
    padding: 8px 16px 10px;
  }
  .page.has-report .table-wrap {
    flex: 0 1 38%;
    min-height: 8rem;
  }
  .page.has-report.chrome-up .table-wrap {
    flex: 0 1 28%;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 6px 10px;
    flex-shrink: 0;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .group label {
    font-size: 11px;
    font-weight: 600;
    color: color-mix(in srgb, var(--theme-fg) 50%, transparent);
  }
  select {
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, var(--theme-fg) 15%, transparent);
    background: var(--theme-input);
    color: var(--theme-fg);
    padding: 4px 8px;
    font-size: 0.8125rem;
    min-width: 8.5rem;
    min-height: 1.75rem;
  }
  .ghost {
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, var(--theme-fg) 15%, transparent);
    background: transparent;
    color: var(--theme-fg);
    padding: 4px 10px;
    font-size: 0.75rem;
    cursor: pointer;
    min-height: 1.75rem;
  }
  .ghost:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .rail-toggle {
    flex-shrink: 0;
  }
  .ops-chrome {
    display: grid;
    grid-template-rows: 1fr;
    min-height: 0;
    transition: grid-template-rows 0.28s ease;
  }
  .ops-chrome.is-up {
    grid-template-rows: 0fr;
  }
  .ops-chrome-inner {
    min-height: 0;
    overflow: hidden;
  }
  @media (prefers-reduced-motion: reduce) {
    .ops-chrome {
      transition: none;
    }
  }
  .center {
    display: flex;
    justify-content: center;
    padding: 24px 0;
  }
  .strip-muted,
  .strip-error {
    margin: 0;
    font-size: 0.75rem;
  }
  .strip-muted {
    color: color-mix(in srgb, var(--theme-fg) 50%, transparent);
  }
  .strip-error {
    color: var(--theme-danger, #e35);
  }
  .table-wrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--theme-fg) 8%, transparent);
    background: var(--theme-table);
  }
  .data-table,
  .steps-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
  }
  .data-table th,
  .steps-table th {
    text-align: left;
    padding: 6px 10px;
    color: color-mix(in srgb, var(--theme-fg) 45%, transparent);
    font-weight: 600;
    border-bottom: 1px solid color-mix(in srgb, var(--theme-fg) 8%, transparent);
    white-space: nowrap;
  }
  .data-table td,
  .steps-table td {
    padding: 6px 10px;
    color: color-mix(in srgb, var(--theme-fg) 80%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--theme-fg) 5%, transparent);
  }
  .data-table tr.clickable {
    cursor: pointer;
  }
  .data-table tr.clickable:hover {
    background: color-mix(in srgb, var(--theme-fg) 4%, transparent);
  }
  .steps-row td {
    background: color-mix(in srgb, var(--theme-fg) 3%, transparent);
    padding: 6px 10px 8px 28px;
  }
  .steps-empty,
  .steps-pad {
    padding: 6px 0;
    color: color-mix(in srgb, var(--theme-fg) 50%, transparent);
  }
  .mono {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .pager {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.75rem;
    color: color-mix(in srgb, var(--theme-fg) 60%, transparent);
    flex-shrink: 0;
  }
</style>
