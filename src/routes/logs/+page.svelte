<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { LogStream } from '$lib/log-stream';
  import type { DocumentFilter } from '$lib/log-document-filter';
  import type { StoredLogCategory } from '$lib/log-category-seeds';
  import { flattenLogFields, projectLogSummary } from '$lib/log-summary-projection';
  import {
    BOUNDED_LOG_ANALYSIS_MAX,
    analysisActionHint,
    buildBoundedLogAnalysisPrompt,
    clearLogSelection,
    projectCompactLogDocument,
    selectFirstLogIds,
    splitSuggestionMarker,
    toggleLogSelection,
  } from '$lib/bounded-log-analysis';
  import {
    formatJsonForCopy,
    orderCatalogFamilies,
  } from '$lib/log-content-copy';
  import {
    createAnalysisWindowLayout,
    type AnalysisWindowLayout,
  } from '$lib/analysis-window-layout';
  import { createDifyStream } from '$lib/dify-client';
  import {
    applyAssistantImagesPayload,
    noticeForImageLoadFailure,
    type ChatImageNotice,
  } from '$lib/assistant-chat-view';
  import { canStartDiagnosisTurn } from '$lib/operator-role';
  import { shortIndexPattern } from '$lib/log-index';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import ErrorMessage from '$lib/components/ErrorMessage.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import HighlightedLogText from '$lib/components/logs/HighlightedLogText.svelte';
  import LogFieldTable from '$lib/components/logs/LogFieldTable.svelte';
  import LogJsonTree from '$lib/components/logs/LogJsonTree.svelte';
  import CopyIconButton from '$lib/components/logs/CopyIconButton.svelte';
  import MessageEnlarge from '$lib/components/logs/MessageEnlarge.svelte';
  import AnalysisWindow from '$lib/components/logs/AnalysisWindow.svelte';
  import LivePodDiagnosticsWindow from '$lib/components/logs/LivePodDiagnosticsWindow.svelte';
  import {
    decideLivePodDiagnosticsClick,
    evaluateLivePodDiagnosticsSelection,
    livePodDiagnosticsGateMessage,
    livePodKey,
    livePodOccupancyForSource,
    presentLivePodDiagnosticsHttpResult,
    trackLivePodReselect,
    type LivePodDiagnosticsRowPhase,
    type LivePodOccupancyView,
  } from '$lib/live-pod-diagnostics';

  type SiteOption = {
    siteId: string;
    title: string;
    factoryCode: string;
    loggingAvailable: boolean;
    robustaCoverage: boolean;
  };

  type ExpandLayer = 'summary' | 'fields' | 'json';

  let siteId = $state('');
  let availableSites = $state<SiteOption[]>([]);
  let watchlist = $state<string[]>([]);
  let activeIndex = $state<string | null>(null);
  let categories = $state<StoredLogCategory[]>([]);
  let prefsSeeded = $state(false);
  let prefsLoading = $state(false);

  let catalogOpen = $state(false);
  let catalogQ = $state('');
  let catalogMode = $state<'fuzzy' | 'regex'>('fuzzy');
  let catalogFamilies = $state<string[]>([]);
  let catalogSelected = $state<string[]>([]);
  let catalogLoading = $state(false);

  let documentFilters = $state<DocumentFilter[]>([]);
  let activeCategoryId = $state<string | null>(null);
  let categoryCounts = $state<Record<string, number>>({});
  let timeFrom = $state(new Date(Date.now() - 3600000).toISOString());
  let timeTo = $state(new Date().toISOString());
  let timePreset = $state('1h');
  let keyword = $state('');
  let pollInterval = $state(3);
  let autoScroll = $state(true);

  let entries = $state<any[]>([]);
  let cursorTop = $state<any>(null);
  let totalCount = $state(0);
  let connectionStatus = $state<'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'>(
    'idle',
  );
  let loadingMore = $state(false);
  let errorMsg = $state<string | null>(null);
  let expandedId = $state<string | null>(null);
  let expandLayer = $state<ExpandLayer>('fields');
  let keywordTimeout: ReturnType<typeof setTimeout> | undefined;
  let countsTimeout: ReturnType<typeof setTimeout> | undefined;

  let stream: LogStream | undefined;

  let selectedIds = $state<string[]>([]);
  let selectionCapMsg = $state<string | null>(null);
  let enlargeMessage = $state<string | null>(null);
  let analysisOpen = $state(false);
  let analysisLayout = $state<AnalysisWindowLayout>(
    createAnalysisWindowLayout(typeof window === 'undefined' ? 1280 : window.innerWidth, typeof window === 'undefined' ? 720 : window.innerHeight),
  );
  let analysisStreaming = $state(false);
  let analysisError = $state('');
  let analysisAnswer = $state('');
  let analysisSuggestions = $state<string[]>([]);
  let analysisImages = $state<Array<{ url: string }>>([]);
  let analysisNotices = $state<ChatImageNotice[]>([]);
  let analysisTruncated = $state(false);
  let analysisConversationId = $state('');
  let analysisRunCount = $state(0);
  let analysisAbort: { abort: () => void } | undefined;
  let analysisHintOpen = $state(false);

  let lpdItems = $state<LivePodOccupancyView[]>([]);
  let lpdOpen = $state(false);
  let lpdLayout = $state<AnalysisWindowLayout>(
    createAnalysisWindowLayout(typeof window === 'undefined' ? 1280 : window.innerWidth, typeof window === 'undefined' ? 720 : window.innerHeight),
  );
  let lpdPhase = $state<LivePodDiagnosticsRowPhase>('pending');
  let lpdError = $state('');
  let lpdTaskId = $state('');
  let lpdNamespace = $state('');
  let lpdPod = $state('');
  let lpdRow = $state<Record<string, unknown> | null>(null);
  let lpdStarting = $state(false);
  let lpdHintOpen = $state(false);

  const canDiagnose = $derived(
    $page.data.operator == null
      ? true
      : canStartDiagnosisTurn($page.data.operator.role),
  );
  const canStream = $derived(Boolean(siteId && activeIndex && watchlist.includes(activeIndex)));
  const canAnalyze = $derived(
    canDiagnose && selectedIds.length > 0 && selectedIds.length <= BOUNDED_LOG_ANALYSIS_MAX && !analysisStreaming,
  );
  const analysisHint = $derived(
    analysisActionHint({
      loadedCount: entries.length,
      selectedCount: selectedIds.length,
      canDiagnose,
    }),
  );
  const offersLivePodDiagnostics = $derived(selectedSite()?.robustaCoverage === true);
  const lpdSelectedSource = $derived.by(() => {
    if (selectedIds.length !== 1) return undefined;
    const entry = entries.find((e) => e._id === selectedIds[0]);
    return entry ? sourceOf(entry) : undefined;
  });
  const lpdSelection = $derived.by(() => {
    if (!siteId || lpdSelectedSource == null) {
      return { ok: false as const, code: 'NOT_ONE_ROW' as const };
    }
    return evaluateLivePodDiagnosticsSelection({ siteId, sources: [lpdSelectedSource] });
  });
  const lpdOccupancy = $derived(
    siteId && lpdSelectedSource
      ? livePodOccupancyForSource(lpdItems, siteId, lpdSelectedSource)
      : null,
  );
  const canStartLivePod = $derived(
    offersLivePodDiagnostics && canDiagnose && lpdSelection.ok && !lpdStarting,
  );
  let reselectArmed = $state<string[]>([]);
  let reselectUnchecked = $state<string[]>([]);
  let reselectPrevious = $state<string[]>([]);
  const lpdHint = $derived.by(() => {
    if (!canDiagnose) return livePodDiagnosticsGateMessage('VIEWER');
    if (!lpdSelection.ok) return livePodDiagnosticsGateMessage(lpdSelection.code);
    if (lpdOccupancy?.inFlight) return livePodDiagnosticsGateMessage('IN_FLIGHT');
    return '將對此 Pod 觸發應用即時狀態分析。';
  });
  const catalogDisplay = $derived(orderCatalogFamilies(catalogSelected, catalogFamilies));
  const catalogVisibleSelectedCount = $derived(
    catalogDisplay.filter((f) => catalogSelected.includes(f)).length,
  );
  const catalogMasterChecked = $derived(
    catalogDisplay.length > 0 && catalogVisibleSelectedCount === catalogDisplay.length,
  );
  const catalogMasterIndeterminate = $derived(
    catalogVisibleSelectedCount > 0 && catalogVisibleSelectedCount < catalogDisplay.length,
  );

  $effect(() => {
    if (canAnalyze) analysisHintOpen = false;
  });

  function podKeyForLogId(id: string): string | null {
    if (!siteId) return null;
    const entry = entries.find((e) => e._id === id);
    if (!entry) return null;
    const selected = evaluateLivePodDiagnosticsSelection({ siteId, sources: [sourceOf(entry)] });
    if (!selected.ok) return null;
    return livePodKey(selected.occupancy.siteId, selected.occupancy.namespace, selected.occupancy.pod);
  }

  $effect(() => {
    const current = selectedIds;
    const previous = reselectPrevious;
    if (current.length === previous.length && current.every((id, i) => id === previous[i])) return;
    const next = trackLivePodReselect({
      armed: new Set(reselectArmed),
      uncheckedIds: new Set(reselectUnchecked),
      previousIds: previous,
      currentIds: current,
      podKeyById: podKeyForLogId,
    });
    reselectArmed = [...next.armed];
    reselectUnchecked = [...next.uncheckedIds];
    reselectPrevious = [...current];
  });

  function onWindowClick(e: MouseEvent) {
    const t = e.target as HTMLElement | null;
    if (!t?.closest('.submit-wrap')) analysisHintOpen = false;
    if (!t?.closest('.lpd-submit-wrap')) lpdHintOpen = false;
  }

  const categoryPatterns = $derived(
    categories
      .map((c) => c.rule?.messagePattern)
      .filter((p): p is { type: string; value: string } => !!p && p.type === 'regex' && !!p.value)
      .map((p) => p.value),
  );

  function selectedSite(): SiteOption | undefined {
    return availableSites.find((s) => s.siteId === siteId);
  }

  function sourceOf(entry: any) {
    return entry?._source ?? entry;
  }

  function toggleDocumentFilter(filter: DocumentFilter) {
    const idx = documentFilters.findIndex(
      (f) => f.path === filter.path && String(f.value) === String(filter.value),
    );
    if (idx >= 0) {
      documentFilters = documentFilters.filter((_, i) => i !== idx);
    } else {
      documentFilters = [...documentFilters, filter];
    }
    handleFilterChange();
  }

  function getStreamUrl() {
    const params = new URLSearchParams();
    params.set('siteId', siteId);
    params.set('index', activeIndex!);
    params.set('timeFrom', timeFrom);
    params.set('timeTo', timeTo);
    params.set('keyword', keyword || '*');
    params.set('interval', String(pollInterval));
    if (documentFilters.length) {
      params.set('documentFilters', JSON.stringify(documentFilters));
    }
    const cat = categories.find((c) => c.id === activeCategoryId);
    if (cat?.rule) {
      params.set('categoryRule', JSON.stringify(cat.rule));
    }
    return `${base}/api/logs/stream?${params.toString()}`;
  }

  async function loadPrefs() {
    if (!siteId) return;
    prefsLoading = true;
    try {
      const res = await fetch(`/api/logs/prefs?siteId=${encodeURIComponent(siteId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to load prefs');
      watchlist = Array.isArray(data.watchlist) ? data.watchlist : [];
      activeIndex = data.activeIndex ?? null;
      categories = Array.isArray(data.categories) ? data.categories : [];
      prefsSeeded = !!data.seeded;
      catalogOpen = watchlist.length === 0;
      if (catalogOpen) void loadCatalog();
      if (canStream) connect();
      else {
        stream?.close();
        connectionStatus = 'idle';
        entries = [];
      }
      scheduleCategoryCounts();
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    } finally {
      prefsLoading = false;
    }
  }

  async function savePrefs(next?: {
    watchlist?: string[];
    activeIndex?: string | null;
    categories?: StoredLogCategory[];
  }) {
    const body = {
      siteId,
      watchlist: next?.watchlist ?? watchlist,
      activeIndex: next?.activeIndex ?? activeIndex,
      categories: next?.categories ?? categories,
    };
    const res = await fetch('/api/logs/prefs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || data?.error || 'Save failed');
    watchlist = data.watchlist ?? body.watchlist;
    activeIndex = data.activeIndex ?? body.activeIndex;
    categories = data.categories ?? body.categories;
    prefsSeeded = false;
    catalogOpen = watchlist.length === 0;
  }

  async function loadCatalog() {
    if (!siteId) return;
    catalogLoading = true;
    try {
      const params = new URLSearchParams({
        siteId,
        q: catalogQ,
        filterMode: catalogMode,
      });
      const res = await fetch(`/api/logs/catalog?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Catalog failed');
      catalogFamilies = Array.isArray(data.families) ? data.families : [];
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
      catalogFamilies = [];
    } finally {
      catalogLoading = false;
    }
  }

  async function commitWatchlistFromCatalog() {
    if (catalogSelected.length === 0) {
      errorMsg = '請至少選擇一個 index family';
      return;
    }
    try {
      await savePrefs({
        watchlist: catalogSelected,
        activeIndex: catalogSelected[0],
        categories,
      });
      catalogOpen = false;
      connect();
      scheduleCategoryCounts();
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  function setTimePreset(preset: string) {
    const now = Date.now();
    const presets: Record<string, number> = {
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
    };
    timePreset = preset;
    if (presets[preset]) timeFrom = new Date(now - presets[preset]).toISOString();
    timeTo = new Date().toISOString();
  }

  function connect() {
    if (!canStream) {
      connectionStatus = 'idle';
      return;
    }
    stream?.close();
    connectionStatus = 'connecting';
    errorMsg = null;
    entries = [];
    selectedIds = [];
    selectionCapMsg = null;
    cursorTop = null;

    stream = new LogStream({
      url: getStreamUrl(),
      onLog: (entry) => {
        entries = [...entries, flattenHit(entry)].slice(-2000);
        if (autoScroll) scrollToBottom();
      },
      onSnapshot: (hits, cursor, total) => {
        entries = (hits ?? []).map(flattenHit);
        cursorTop = cursor;
        totalCount = total ?? 0;
        connectionStatus = 'connected';
        scrollToBottom();
      },
      onError: (msg) => {
        errorMsg = msg;
        connectionStatus = 'error';
      },
      onReconnect: () => {
        connectionStatus = 'reconnecting';
      },
    });
    stream.connect();
  }

  function flattenHit(hit: any) {
    if (hit && hit._source) {
      return { _id: hit._id, sort: hit.sort, _source: hit._source };
    }
    return hit;
  }

  function handleFilterChange() {
    if (canStream) connect();
    scheduleCategoryCounts();
  }

  function onKeywordInput() {
    clearTimeout(keywordTimeout);
    keywordTimeout = setTimeout(() => handleFilterChange(), 300);
  }

  function scheduleCategoryCounts() {
    clearTimeout(countsTimeout);
    countsTimeout = setTimeout(() => {
      void refreshCategoryCounts();
    }, 200);
  }

  async function refreshCategoryCounts() {
    if (!canStream) {
      categoryCounts = {};
      return;
    }
    try {
      const res = await fetch('/api/logs/category-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          index: activeIndex,
          timeFrom,
          timeTo,
          keyword: keyword || '*',
          documentFilters,
          categories: categories.map((c) => {
            // When drilling into a category, other totals are counted inside that scope
            if (activeCategoryId && c.id !== activeCategoryId) {
              const active = categories.find((x) => x.id === activeCategoryId);
              if (active?.rule) {
                return {
                  ...c,
                  rule: {
                    documentFilters: [
                      ...(active.rule.documentFilters ?? []),
                      ...(c.rule.documentFilters ?? []),
                    ],
                    ranges: [...(active.rule.ranges ?? []), ...(c.rule.ranges ?? [])],
                    messagePattern: c.rule.messagePattern ?? active.rule.messagePattern,
                  },
                };
              }
            }
            return c;
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) return;
      const map: Record<string, number> = {};
      for (const c of data.counts ?? []) {
        if (c?.id) map[c.id] = c.total ?? 0;
      }
      categoryCounts = map;
    } catch {
      /* ignore */
    }
  }

  async function toggleCategory(id: string) {
    activeCategoryId = activeCategoryId === id ? null : id;
    // Apply category ranges as document filters aren't enough — reconnect with category must via counts API scope:
    // For range-based categories, inject by re-query: store active category and merge ranges into stream via temporary filters.
    handleFilterChange();
  }

  async function loadEarlier() {
    if (!canStream || !cursorTop || loadingMore) return;
    loadingMore = true;
    try {
      const res = await fetch('/api/es/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          index: activeIndex,
          query: keyword || '*',
          timeFrom,
          timeTo,
          size: 100,
          searchAfter: cursorTop,
          documentFilters,
          categoryRule: categories.find((c) => c.id === activeCategoryId)?.rule,
        }),
      });
      const data = await res.json();
      if (res.ok && data.hits?.length) {
        entries = [...data.hits.map(flattenHit), ...entries];
        cursorTop = data.cursor;
      }
    } finally {
      loadingMore = false;
    }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const el = document.getElementById('log-container');
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  function onSiteChange() {
    activeCategoryId = null;
    documentFilters = [];
    selectedIds = [];
    selectionCapMsg = null;
    closeAnalysis();
    closeLivePodWindow();
    void loadPrefs();
  }

  async function onActiveIndexChange(next: string) {
    activeIndex = next;
    try {
      await savePrefs({ activeIndex: next });
      connect();
      scheduleCategoryCounts();
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      expandedId = null;
      return;
    }
    expandedId = id;
    expandLayer = 'fields';
  }

  function onToggleSelect(id: string, event: Event) {
    event.stopPropagation();
    const r = toggleLogSelection(selectedIds, id);
    selectedIds = r.selected;
    selectionCapMsg = r.ok ? null : `最多選 ${BOUNDED_LOG_ANALYSIS_MAX} 筆；請先取消部分選取。`;
  }

  function onClearLogSelection() {
    selectedIds = clearLogSelection().selected;
    selectionCapMsg = null;
  }

  function onSelectFirstLogs() {
    const ids = entries.map((e) => e._id).filter(Boolean) as string[];
    const r = selectFirstLogIds(ids);
    selectedIds = r.selected;
    selectionCapMsg = r.truncated
      ? `已選 buffer 前 ${BOUNDED_LOG_ANALYSIS_MAX} 筆（共 ${ids.length} 筆已載入）。`
      : null;
  }

  function openMessageEnlarge(text: string, event: Event) {
    event.stopPropagation();
    if (!text?.trim()) return;
    enlargeMessage = text;
  }

  let catalogMasterEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (catalogMasterEl) {
      catalogMasterEl.indeterminate = catalogMasterIndeterminate;
    }
  });

  function clearCatalogSelection() {
    catalogSelected = [];
  }

  function onCatalogMasterChange(event: Event) {
    const checked = (event.currentTarget as HTMLInputElement).checked;
    if (checked) {
      const set = new Set(catalogSelected);
      for (const f of catalogDisplay) set.add(f);
      catalogSelected = [...set];
    } else {
      const visible = new Set(catalogDisplay);
      catalogSelected = catalogSelected.filter((f) => !visible.has(f));
    }
  }

  function resetAnalysisView() {
    analysisAnswer = '';
    analysisSuggestions = [];
    analysisImages = [];
    analysisNotices = [];
    analysisTruncated = false;
    analysisError = '';
  }

  function closeAnalysis() {
    analysisAbort?.abort();
    analysisAbort = undefined;
    analysisStreaming = false;
    analysisOpen = false;
    analysisLayout = { ...analysisLayout, mode: 'floating' };
    analysisConversationId = '';
    resetAnalysisView();
  }

  function closeLivePodWindow() {
    lpdOpen = false;
    lpdLayout = { ...lpdLayout, mode: 'floating' };
  }

  async function loadLpdOccupancy() {
    if (!siteId) {
      lpdItems = [];
      return;
    }
    try {
      const res = await fetch(`/api/logs/live-pod-diagnostics?siteId=${encodeURIComponent(siteId)}`);
      const data = await res.json();
      if (!res.ok) return;
      lpdItems = Array.isArray(data.items) ? data.items : [];
    } catch {
      /* occupancy chrome is best-effort */
    }
  }

  async function refreshLpdResult() {
    if (!lpdTaskId) return;
    try {
      const res = await fetch(`/api/logs/live-pod-diagnostics?taskId=${encodeURIComponent(lpdTaskId)}`);
      const data = await res.json();
      if (!res.ok) {
        lpdError = data?.error || '讀取應用即時狀態分析失敗';
        return;
      }
      lpdPhase = data.phase ?? 'pending';
      lpdRow = data.row ?? null;
      if (data.occupancy) {
        lpdNamespace = data.occupancy.namespace ?? lpdNamespace;
        lpdPod = data.occupancy.pod ?? lpdPod;
      }
      await loadLpdOccupancy();
    } catch (e) {
      lpdError = e instanceof Error ? e.message : String(e);
    }
  }

  function openLivePodWindow(opts: {
    taskId: string;
    namespace?: string;
    pod?: string;
    error?: string;
    phase?: LivePodDiagnosticsRowPhase;
    row?: Record<string, unknown> | null;
  }) {
    lpdTaskId = opts.taskId;
    lpdNamespace = opts.namespace ?? '';
    lpdPod = opts.pod ?? '';
    lpdError = opts.error ?? '';
    lpdPhase = opts.phase ?? 'pending';
    lpdRow = opts.row ?? null;
    lpdOpen = true;
    lpdLayout = { ...lpdLayout, mode: 'floating' };
    if (!opts.error && opts.taskId) void refreshLpdResult();
  }

  function selectedLivePodKey(): string | null {
    if (!lpdSelection.ok) return null;
    return livePodKey(lpdSelection.occupancy.siteId, lpdSelection.occupancy.namespace, lpdSelection.occupancy.pod);
  }

  async function loadLivePodPhase(taskId: string): Promise<LivePodDiagnosticsRowPhase | null> {
    const res = await fetch(`/api/logs/live-pod-diagnostics?taskId=${encodeURIComponent(taskId)}`);
    let data: { phase?: LivePodDiagnosticsRowPhase } | null = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok || !data?.phase) return null;
    return data.phase;
  }

  async function startLivePodDiagnosticsAction() {
    if (!siteId || !canStartLivePod || lpdSelectedSource == null || !lpdSelection.ok) {
      lpdHintOpen = !lpdHintOpen;
      return;
    }
    const podKey = selectedLivePodKey();
    const armed = podKey ? reselectArmed.includes(podKey) : false;
    const clickInput = {
      selectable: true,
      inFlight: lpdOccupancy?.inFlight === true,
      taskId: lpdOccupancy?.taskId ?? null,
      armed,
    };
    lpdStarting = true;
    lpdHintOpen = false;
    try {
      let phase: LivePodDiagnosticsRowPhase | null = null;
      let decision = decideLivePodDiagnosticsClick({ ...clickInput, phase });
      if (decision.kind === 'resolve') {
        phase = await loadLivePodPhase(decision.taskId);
        decision = decideLivePodDiagnosticsClick({ ...clickInput, phase });
      }
      if (decision.kind === 'open') {
        openLivePodWindow({
          taskId: decision.taskId,
          namespace: lpdSelection.occupancy.namespace,
          pod: lpdSelection.occupancy.pod,
          phase: phase === 'success' || phase === 'failure' ? phase : 'pending',
        });
        return;
      }
      const res = await fetch('/api/logs/live-pod-diagnostics', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId, source: lpdSelectedSource }),
      });
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      const view = presentLivePodDiagnosticsHttpResult({ status: res.status, body: data });
      openLivePodWindow({
        taskId: view.taskId,
        namespace: view.namespace || lpdSelection.occupancy.namespace,
        pod: view.pod || lpdSelection.occupancy.pod,
        phase: view.phase,
        error: view.error,
      });
      if (res.status === 200 && !view.error && podKey) {
        reselectArmed = reselectArmed.filter((key) => key !== podKey);
      }
      if (!view.error) await loadLpdOccupancy();
    } catch (e) {
      openLivePodWindow({
        taskId: '',
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      lpdStarting = false;
    }
  }

  function onLivePodSubmitClick() {
    if (!canStartLivePod) {
      lpdHintOpen = !lpdHintOpen;
      return;
    }
    void startLivePodDiagnosticsAction();
  }

  $effect(() => {
    if (!siteId) {
      lpdItems = [];
      return;
    }
    void loadLpdOccupancy();
  });

  $effect(() => {
    if (!lpdOpen || lpdPhase !== 'pending' || !lpdTaskId || lpdError) return;
    const timer = setInterval(() => {
      void refreshLpdResult();
    }, 3000);
    return () => clearInterval(timer);
  });

  function applyAnalysisText(raw: string) {
    const split = splitSuggestionMarker(raw);
    analysisAnswer = split.answer;
    analysisSuggestions = split.suggestions;
  }

  function runAnalysisTurn(query: string, opts?: { freshConversation?: boolean }) {
    if (!canDiagnose || !siteId || !query.trim()) return;
    analysisAbort?.abort();
    analysisOpen = true;
    analysisLayout = { ...analysisLayout, mode: 'floating' };
    analysisStreaming = true;
    analysisError = '';
    resetAnalysisView();
    if (opts?.freshConversation) {
      analysisConversationId = '';
      analysisRunCount = selectedIds.length;
    }
    let raw = '';

    analysisAbort = createDifyStream({
      query,
      siteId,
      conversationId: opts?.freshConversation ? undefined : analysisConversationId || undefined,
      callbacks: {
        onMessage(chunk) {
          raw += chunk;
          applyAnalysisText(raw);
        },
        onAssistantImages(payload) {
          const view = applyAssistantImagesPayload(raw, payload);
          raw = view.content;
          applyAnalysisText(raw);
          analysisImages = view.images;
          analysisNotices = view.notices;
          analysisTruncated = view.truncated;
        },
        onEnd(nextId) {
          analysisStreaming = false;
          if (nextId) analysisConversationId = nextId;
          if (!raw.trim()) {
            analysisError = '分析未回傳內容';
          }
        },
        onError(err) {
          analysisStreaming = false;
          analysisError = err || '分析失敗';
        },
      },
    });
  }

  function onAnalysisSubmitClick() {
    if (!canAnalyze) {
      analysisHintOpen = !analysisHintOpen;
      return;
    }
    startBoundedAnalysis();
  }

  function startBoundedAnalysis() {
    if (!canAnalyze) return;
    if (analysisOpen && (analysisAnswer || analysisStreaming || analysisConversationId)) {
      if (!confirm('開始新的日誌分析會取代目前的分析視窗，確定？')) return;
    }
    const byId = new Map(entries.map((e) => [e._id, e]));
    const docs = selectedIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((entry) => projectCompactLogDocument(sourceOf(entry)));
    if (docs.length === 0) {
      selectionCapMsg = '選取的日誌已不在目前 buffer，請重新勾選。';
      return;
    }
    const siteTitle = selectedSite()?.title || siteId;
    runAnalysisTurn(buildBoundedLogAnalysisPrompt(docs, siteTitle), { freshConversation: true });
  }

  function followUpSuggestion(question: string) {
    if (!canDiagnose || analysisStreaming || !question.trim()) return;
    runAnalysisTurn(question.trim());
  }

  function onAnalysisImageFailed(url: string) {
    analysisImages = analysisImages.filter((img) => img.url !== url);
    analysisNotices = [...analysisNotices, noticeForImageLoadFailure(url)];
  }

  onMount(async () => {
    analysisLayout = createAnalysisWindowLayout(window.innerWidth, window.innerHeight);
    const lpd = createAnalysisWindowLayout(window.innerWidth, window.innerHeight);
    lpd.x = Math.max(12, lpd.x - 40);
    lpdLayout = lpd;
    try {
      const res = await fetch('/api/sites');
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.sites ?? []);
      availableSites = list.map((s: any) => ({
        siteId: s.siteId ?? s.id,
        title: s.title ?? s.name ?? s.siteId,
        factoryCode: s.factoryCode ?? '',
        loggingAvailable: s.loggingAvailable !== false && !!s.factoryCode,
        robustaCoverage: s.robustaCoverage === true,
      }));
    } catch {
      availableSites = [];
    }
  });
</script>

<svelte:window onclick={onWindowClick} />

<div class="page">
  <header class="filters">
    <div class="group site">
      <label for="site">Site</label>
      <select id="site" bind:value={siteId} onchange={onSiteChange} title="Site">
        <option value="" disabled>Select site…</option>
        {#each availableSites as site}
          <option value={site.siteId} disabled={!site.loggingAvailable}>
            {site.title} ({site.factoryCode || 'no code'})
          </option>
        {/each}
      </select>
    </div>

    {#if watchlist.length > 0}
      <div class="group index">
        <label for="active-index">Index</label>
        <select
          id="active-index"
          value={activeIndex ?? ''}
          title={activeIndex ?? ''}
          onchange={(e) => onActiveIndexChange((e.currentTarget as HTMLSelectElement).value)}
        >
          {#each watchlist as pattern}
            <option value={pattern} title={pattern}>{shortIndexPattern(pattern)}</option>
          {/each}
        </select>
      </div>
      <button type="button" class="ghost" onclick={() => { catalogSelected = [...watchlist]; catalogOpen = true; void loadCatalog(); }}>
        Watchlist
      </button>
    {/if}

    <div class="group">
      <label>Time</label>
      <div class="presets">
        {#each ['5m', '15m', '1h', '24h'] as preset}
          <button
            type="button"
            class:active={timePreset === preset}
            onclick={() => {
              setTimePreset(preset);
              handleFilterChange();
            }}>{preset}</button
          >
        {/each}
      </div>
    </div>

    <div class="group keyword">
      <label for="kw">Keyword</label>
      <input id="kw" type="text" bind:value={keyword} oninput={onKeywordInput} placeholder="query…" />
    </div>

    <div class="group interval">
      <label for="interval">Interval</label>
      <select id="interval" bind:value={pollInterval} onchange={handleFilterChange}>
        <option value={1}>1s</option>
        <option value={3}>3s</option>
        <option value={5}>5s</option>
        <option value={10}>10s</option>
      </select>
    </div>

    {#if connectionStatus === 'connected'}
      <span class="live-pill"><span class="live-dot"></span> LIVE</span>
    {/if}
  </header>

  {#if documentFilters.length}
    <div class="filter-chips">
      {#each documentFilters as f, i}
        <button type="button" class="chip" onclick={() => toggleDocumentFilter(f)}>
          {f.path}={String(f.value)} ×
        </button>
      {/each}
    </div>
  {/if}

  {#if categories.length && canStream}
    <div class="categories">
      {#each categories as cat}
        <button
          type="button"
          class="cat"
          class:active={activeCategoryId === cat.id}
          onclick={() => toggleCategory(cat.id)}
        >
          <span>{cat.name}</span>
          <strong>{categoryCounts[cat.id] ?? '…'}</strong>
        </button>
      {/each}
    </div>
  {/if}

  {#if catalogOpen && siteId}
    <section class="catalog">
      <h2>Site Index Catalog</h2>
      <p class="hint">
        尚未設定常用 Index 時，請用模糊或正規式篩選 family，至少選一個存進 Watchlist。
        {#if prefsSeeded}（分類種子將一併儲存）{/if}
      </p>
      <div class="catalog-bar">
        <input
          type="text"
          bind:value={catalogQ}
          placeholder={catalogMode === 'regex' ? 'regex…' : 'fuzzy…'}
          onkeydown={(e) => e.key === 'Enter' && loadCatalog()}
        />
        <div class="presets">
          <button type="button" class:active={catalogMode === 'fuzzy'} onclick={() => (catalogMode = 'fuzzy')}>模糊</button>
          <button type="button" class:active={catalogMode === 'regex'} onclick={() => (catalogMode = 'regex')}>Regex</button>
        </div>
        <button type="button" onclick={() => loadCatalog()} disabled={catalogLoading}>
          {catalogLoading ? '…' : '搜尋'}
        </button>
        <button type="button" onclick={clearCatalogSelection} disabled={catalogSelected.length === 0}>
          清除選擇
        </button>
        <button
          type="button"
          class="primary"
          onclick={() => commitWatchlistFromCatalog()}
          disabled={catalogSelected.length === 0}
          title={catalogSelected.length === 0 ? '請至少選擇一個 index family' : undefined}
        >
          存成 Watchlist
        </button>
      </div>
      <div class="catalog-list">
        {#if catalogDisplay.length > 0}
          <label class="fam master">
            <input
              type="checkbox"
              bind:this={catalogMasterEl}
              checked={catalogMasterChecked}
              onchange={onCatalogMasterChange}
              aria-label="全選可見列表"
            />
            <span>全選可見（已選 {catalogSelected.length}）</span>
          </label>
        {/if}
        {#each catalogDisplay as fam (fam)}
          <label class="fam" class:pinned={catalogSelected.includes(fam)}>
            <input
              type="checkbox"
              checked={catalogSelected.includes(fam)}
              onchange={() => {
                if (catalogSelected.includes(fam)) {
                  catalogSelected = catalogSelected.filter((x) => x !== fam);
                } else {
                  catalogSelected = [...catalogSelected, fam];
                }
              }}
            />
            <span>{fam}</span>
          </label>
        {:else}
          <EmptyState title="無 family" description="調整關鍵字或先按搜尋。" icon="📇" />
        {/each}
      </div>
    </section>
  {/if}

  <div class="stream-bar">
    <button type="button" onclick={loadEarlier} disabled={loadingMore || !canStream}>
      {loadingMore ? 'Loading…' : 'Load Earlier'}
    </button>
    <button type="button" onclick={() => (autoScroll = !autoScroll)}>
      {autoScroll ? 'Pause' : 'Resume'} Auto-scroll
    </button>
    <button type="button" onclick={onSelectFirstLogs} disabled={entries.length === 0}>
      全選（最多 {BOUNDED_LOG_ANALYSIS_MAX}）
    </button>
    <button type="button" onclick={onClearLogSelection} disabled={selectedIds.length === 0}>
      清除選擇
    </button>
    {#if prefsLoading}
      <span class="muted">Loading prefs…</span>
    {/if}
    <div class="lpd-submit-wrap">
      {#if offersLivePodDiagnostics}
        <button
          type="button"
          class="primary lpd-submit"
          class:is-blocked={!canStartLivePod}
          aria-disabled={!canStartLivePod}
          aria-expanded={lpdHintOpen && !canStartLivePod}
          aria-controls={canStartLivePod ? undefined : 'lpd-hint'}
          onclick={onLivePodSubmitClick}
        >
          應用即時狀態分析
        </button>
        {#if lpdHintOpen && !canStartLivePod}
          <p id="lpd-hint" class="hint-pop" role="status">{lpdHint}</p>
        {/if}
      {/if}
    </div>
    <div class="submit-wrap">
      <button
        type="button"
        class="primary analysis-submit"
        class:is-blocked={!canAnalyze}
        aria-disabled={!canAnalyze}
        aria-expanded={analysisHintOpen && !canAnalyze}
        aria-controls={canAnalyze ? undefined : 'analysis-hint'}
        onclick={onAnalysisSubmitClick}
      >
        送出分析 ({selectedIds.length}/{BOUNDED_LOG_ANALYSIS_MAX})
      </button>
      {#if analysisHintOpen && !canAnalyze}
        <p id="analysis-hint" class="hint-pop" role="status">{analysisHint}</p>
      {/if}
    </div>
  </div>
  {#if selectionCapMsg}
    <p class="cap-warn">{selectionCapMsg}</p>
  {/if}

  <div id="log-container" class="log-container">
    {#if connectionStatus === 'connecting'}
      <LoadingSpinner label="Connecting…" />
    {/if}
    {#if !siteId}
      <EmptyState title="Select a Site" description="Smart Logging requires one Site with a Factory Code." icon="📍" />
    {:else if !canStream && !catalogOpen}
      <EmptyState title="Watchlist required" description="從 Catalog 選擇至少一個 index family。" icon="📇" />
    {/if}
    {#if errorMsg}
      <ErrorMessage message={errorMsg} onRetry={connect} compact />
    {/if}
    {#if entries.length === 0 && connectionStatus === 'connected'}
      <EmptyState title="No logs" description="Try adjusting filters or time range." icon="🔍" />
    {/if}

    {#if entries.length > 0}
      <div class="table-header">
        <span class="c sel">選</span>
        <span class="c lpd" title="應用即時狀態分析">即</span>
        <span class="c ts">時間</span>
        <span class="c svc">服務名稱</span>
        <span class="c st">HTTP</span>
        <span class="c method">Method</span>
        <span class="c proto">Proto</span>
        <span class="c path">Path</span>
        <span class="c ua">UA</span>
        <span class="c msg">Message</span>
      </div>
    {/if}

    {#each entries as entry (entry._id)}
      {@const src = sourceOf(entry)}
      {@const summary = projectLogSummary(src)}
      {@const occ = livePodOccupancyForSource(lpdItems, siteId, src)}
      <div class="log-row-wrapper" class:selected={selectedIds.includes(entry._id)}>
        <div
          class="log-row"
          role="button"
          tabindex="0"
          onclick={() => toggleExpand(entry._id)}
          onkeypress={(e) => e.key === 'Enter' && toggleExpand(entry._id)}
        >
          <label
            class="c sel"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(entry._id)}
              onchange={(e) => onToggleSelect(entry._id, e)}
              aria-label="選取此筆日誌"
            />
          </label>
          <span class="c lpd" onclick={(e) => e.stopPropagation()}>
            {#if occ}
              <button
                type="button"
                class="lpd-icon"
                class:in-flight={occ.inFlight}
                title={occ.inFlight ? '應用即時狀態分析進行中' : '查看應用即時狀態分析'}
                aria-label={occ.inFlight ? '應用即時狀態分析進行中' : '查看應用即時狀態分析'}
                onclick={() =>
                  openLivePodWindow({
                    taskId: occ.taskId,
                    namespace: occ.namespace,
                    pod: occ.pod,
                    phase: occ.inFlight ? 'pending' : 'success',
                  })}
              >
                ●
              </button>
            {/if}
          </span>
          <span class="exp">{expandedId === entry._id ? '▼' : '▶'}</span>
          <span class="c ts">{summary.timestamp}</span>
          <span class="c svc">{summary.serviceName || '—'}</span>
          <span class="c st">{summary.httpStatus || '—'}</span>
          <span class="c method">{summary.httpMethod || '—'}</span>
          <span class="c proto">{summary.networkProtocol || '—'}</span>
          <span class="c path">{summary.path || '—'}</span>
          <span class="c ua">{summary.userAgent || '—'}</span>
          <span
            class="c msg"
            role="button"
            tabindex="0"
            title="點擊放大訊息"
            onclick={(e) => openMessageEnlarge(summary.message, e)}
            onkeypress={(e) => e.key === 'Enter' && openMessageEnlarge(summary.message, e)}
          >
            <HighlightedLogText
              text={summary.message}
              keyword={keyword}
              categoryPatterns={categoryPatterns}
            />
          </span>
        </div>
        {#if expandedId === entry._id}
          <div class="expand-pane">
            <div class="layer-tabs">
              <button type="button" class:active={expandLayer === 'fields'} onclick={() => (expandLayer = 'fields')}>欄位表</button>
              <button type="button" class:active={expandLayer === 'json'} onclick={() => (expandLayer = 'json')}>JSON Tree</button>
            </div>
            {#if expandLayer === 'fields'}
              <LogFieldTable fields={flattenLogFields(src)} onToggleFilter={toggleDocumentFilter} />
            {:else}
              <div class="json-wrap">
                <div class="json-toolbar">
                  <span class="toolbar-label">JSON Tree</span>
                  <CopyIconButton text={formatJsonForCopy(src)} label="複製 JSON" />
                </div>
                <LogJsonTree value={src} onToggleFilter={toggleDocumentFilter} />
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}

    {#if entries.length > 0}
      <div class="log-footer">End of buffer · {entries.length} loaded · ES total {totalCount}</div>
    {/if}
  </div>
</div>

<AnalysisWindow
  open={analysisOpen}
  layout={analysisLayout}
  streaming={analysisStreaming}
  error={analysisError}
  answer={analysisAnswer}
  suggestions={analysisSuggestions}
  images={analysisImages}
  notices={analysisNotices}
  truncated={analysisTruncated}
  selectedCount={analysisRunCount}
  onClose={closeAnalysis}
  onLayoutChange={(next) => (analysisLayout = next)}
  onSuggestion={followUpSuggestion}
  onImageLoadFailed={onAnalysisImageFailed}
/>

<LivePodDiagnosticsWindow
  open={lpdOpen}
  layout={lpdLayout}
  phase={lpdPhase}
  error={lpdError}
  namespace={lpdNamespace}
  pod={lpdPod}
  taskId={lpdTaskId}
  row={lpdRow}
  onClose={closeLivePodWindow}
  onLayoutChange={(next) => (lpdLayout = next)}
/>

<MessageEnlarge
  open={enlargeMessage != null}
  text={enlargeMessage ?? ''}
  keyword={keyword}
  categoryPatterns={categoryPatterns}
  onClose={() => (enlargeMessage = null)}
/>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--theme-inset);
    padding: 8px 16px 8px;
  }
  .live-pill {
    margin-left: auto;
    align-self: flex-end;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 1.75rem;
    padding: 0 8px;
    border-radius: 999px;
    font-size: 0.6875rem;
    font-weight: 700;
    background: var(--theme-success-bg);
    border: 1px solid var(--theme-success-border);
    color: var(--theme-success);
  }
  .live-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--theme-success);
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 6px 10px;
    padding: 0 0 8px;
    border-bottom: 1px solid var(--theme-line);
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .group.site {
    flex: 0 1 9.5rem;
    max-width: 11rem;
  }
  .group.index {
    flex: 0 1 16rem;
    max-width: 18rem;
  }
  .group.keyword {
    flex: 0 1 12rem;
    max-width: 14rem;
  }
  .group.interval {
    width: 4.5rem;
  }
  label {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--theme-muted-strong);
  }
  select,
  input[type='text'] {
    background: var(--theme-elevated);
    border: 1px solid var(--theme-line);
    color: var(--theme-fg);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 0.8125rem;
    min-height: 1.75rem;
    max-width: 100%;
  }
  .group.index select {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .presets {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .presets button,
  .ghost,
  .stream-bar button,
  .layer-tabs button,
  .catalog-bar button,
  .cat,
  .chip {
    background: var(--theme-elevated);
    border: 1px solid var(--theme-line);
    color: var(--theme-fg);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 0.75rem;
    cursor: pointer;
    min-height: 1.75rem;
  }
  .filters > .ghost {
    align-self: flex-end;
  }
  .presets button.active,
  .layer-tabs button.active,
  .cat.active {
    border-color: var(--theme-info);
    background: var(--theme-info-bg);
    color: var(--theme-info-fg);
  }
  .primary {
    background: var(--theme-info-bg) !important;
    border-color: var(--theme-info-border) !important;
    color: var(--theme-info-fg) !important;
  }
  .filter-chips,
  .categories {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px 0;
  }
  .cat strong {
    margin-left: 6px;
    font-variant-numeric: tabular-nums;
  }
  .chip {
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
  }
  .catalog {
    margin: 6px 0;
    padding: 8px 10px;
    border: 1px solid var(--theme-line);
    border-radius: 8px;
    background: var(--theme-elevated);
    flex-shrink: 0;
  }
  .catalog h2 {
    margin: 0 0 2px;
    font-size: 0.8125rem;
  }
  .hint {
    margin: 0 0 6px;
    font-size: 0.75rem;
    color: var(--theme-muted);
  }
  .catalog :global(.empty-state) {
    padding: 12px 8px;
  }
  .catalog :global(.empty-icon) {
    font-size: 1.5rem;
    margin-bottom: 4px;
  }
  .catalog-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
    align-items: center;
  }
  .catalog-bar input {
    flex: 1;
    min-width: 160px;
  }
  .catalog-list {
    max-height: 8rem;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .fam {
    display: flex;
    gap: 8px;
    align-items: center;
    font-family: ui-monospace, monospace;
    font-size: 0.8125rem;
  }
  .fam.master {
    font-family: inherit;
    font-weight: 600;
    padding-bottom: 4px;
    border-bottom: 1px solid color-mix(in srgb, var(--theme-line) 70%, transparent);
    margin-bottom: 2px;
  }
  .fam.pinned span {
    color: var(--theme-info, #38bdf8);
  }
  .stream-bar {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 6px 0;
    flex-shrink: 0;
  }
  .muted {
    font-size: 0.75rem;
    color: var(--theme-muted);
  }
  .cap-warn {
    font-size: 0.75rem;
    color: var(--theme-danger);
    margin: 0 0 4px;
  }
  .stream-bar button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .lpd-submit-wrap {
    position: relative;
    margin-left: auto;
    flex-shrink: 0;
  }
  .submit-wrap {
    position: relative;
    flex-shrink: 0;
  }
  .analysis-submit,
  .lpd-submit {
    flex-shrink: 0;
    white-space: nowrap;
  }
  .analysis-submit.is-blocked,
  .lpd-submit.is-blocked {
    opacity: 0.45;
    cursor: help;
  }
  .hint-pop {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 20;
    width: min(22rem, 70vw);
    margin: 0;
    padding: 8px 10px;
    border: 1px solid var(--theme-info-border);
    border-radius: 8px;
    background: var(--theme-elevated);
    color: var(--theme-fg);
    font-size: 0.75rem;
    line-height: 1.45;
    box-shadow: 0 8px 24px color-mix(in srgb, #000 18%, transparent);
  }
  .log-container {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--theme-line);
    border-radius: 8px;
    background: var(--theme-table);
  }
  .table-header,
  .log-row {
    display: grid;
    grid-template-columns: 32px 28px 20px 150px 110px 52px 64px 52px 90px 80px 1fr;
    gap: 8px;
    align-items: center;
    padding: 6px 10px;
    font-size: 0.75rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .table-header {
    position: sticky;
    top: 0;
    background: var(--theme-inset);
    z-index: 1;
    color: var(--theme-muted-strong);
    font-weight: 600;
    border-bottom: 1px solid var(--theme-line);
  }
  .log-row {
    cursor: pointer;
    border-bottom: 1px solid color-mix(in srgb, var(--theme-line) 60%, transparent);
  }
  .log-row:hover {
    background: var(--theme-elevated);
  }
  .log-row-wrapper.selected .log-row {
    background: var(--theme-info-bg);
  }
  .c.sel {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .c.lpd {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .lpd-icon {
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--theme-success, #22c55e);
    cursor: pointer;
    font-size: 0.7rem;
    line-height: 1;
  }
  .lpd-icon.in-flight {
    color: var(--theme-info, #38bdf8);
  }
  .c.sel input {
    margin: 0;
    cursor: pointer;
  }
  .c {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .c.msg {
    white-space: normal;
    cursor: zoom-in;
  }
  .c.msg:hover {
    color: var(--theme-info, #38bdf8);
  }
  .expand-pane {
    border-bottom: 1px solid var(--theme-line);
    background: var(--theme-elevated);
  }
  .layer-tabs {
    display: flex;
    gap: 6px;
    padding: 8px 10px;
  }
  .json-wrap {
    padding: 0 0 12px;
    max-height: 320px;
    overflow: auto;
  }
  .json-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px;
    position: sticky;
    top: 0;
    background: var(--theme-elevated);
    border-bottom: 1px solid color-mix(in srgb, var(--theme-line) 70%, transparent);
    z-index: 1;
  }
  .json-toolbar .toolbar-label {
    font-size: 0.6875rem;
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
  }
  .json-wrap :global(.node),
  .json-wrap :global(.leaf) {
    padding-left: 10px;
  }
  .log-footer {
    padding: 10px;
    text-align: center;
    font-size: 0.75rem;
    color: var(--theme-muted);
  }
</style>
