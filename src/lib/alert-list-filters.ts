/**
 * Pure helpers for Alert Center list filters (URL ↔ state).
 * Kept free of Svelte reactivity so the sync/fetch contract is unit-testable.
 */

export type AlertListFilterState = {
  site: string;
  severity: string;
  status: string;
  search: string;
  timeRange: string;
  /** Preserved when URL has timeFrom that is not a known preset delta. */
  timeFrom: string;
  activeFrom: string;
  activeTo: string;
};

export const DEFAULT_ALERT_LIST_FILTERS: AlertListFilterState = {
  site: '',
  severity: '',
  status: 'all',
  search: '',
  timeRange: 'all',
  timeFrom: '',
  activeFrom: '',
  activeTo: '',
};

/** Infer preset timeRange from a timeFrom ISO timestamp relative to `now`. */
export function inferTimeRangeFromTimeFrom(
  timeFromIso: string,
  nowMs: number = Date.now(),
): string {
  const fromMs = new Date(timeFromIso).getTime();
  if (Number.isNaN(fromMs)) return 'all';
  const delta = nowMs - fromMs;
  const hour = 3600000;
  // Allow skew for request/render latency
  if (Math.abs(delta - hour) < 120000) return '1h';
  if (Math.abs(delta - 6 * hour) < 120000) return '6h';
  if (Math.abs(delta - 24 * hour) < 120000) return '24h';
  if (Math.abs(delta - 7 * 24 * hour) < 300000) return '7d';
  return 'all';
}

export function readAlertFiltersFromSearchParams(
  sp: URLSearchParams,
  nowMs: number = Date.now(),
): AlertListFilterState {
  const activeFrom = sp.get('activeFrom') ?? '';
  const activeTo = sp.get('activeTo') ?? '';
  const timeFrom = sp.get('timeFrom') ?? '';

  let timeRange = 'all';
  if (activeFrom && activeTo) {
    timeRange = 'custom';
  } else if (timeFrom) {
    timeRange = inferTimeRangeFromTimeFrom(timeFrom, nowMs);
  }

  return {
    site: sp.get('site') ?? '',
    severity: sp.get('severity') ?? '',
    status: sp.get('status') ?? 'all',
    search: sp.get('search') ?? '',
    timeRange,
    timeFrom: activeFrom && activeTo ? '' : timeFrom,
    activeFrom,
    activeTo,
  };
}

export function buildAlertFilterSearchParams(
  state: AlertListFilterState,
  nowMs: number = Date.now(),
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.site) params.set('site', state.site);
  if (state.severity) params.set('severity', state.severity);
  if (state.status && state.status !== 'all') params.set('status', state.status);
  if (state.search.trim()) params.set('search', state.search.trim());

  if (state.activeFrom && state.activeTo) {
    params.set('activeFrom', state.activeFrom);
    params.set('activeTo', state.activeTo);
  } else if (state.timeRange !== 'all' && state.timeRange !== 'custom') {
    const now = new Date(nowMs);
    let from: Date;
    switch (state.timeRange) {
      case '1h':
        from = new Date(now.getTime() - 3600000);
        break;
      case '6h':
        from = new Date(now.getTime() - 21600000);
        break;
      case '24h':
        from = new Date(now.getTime() - 86400000);
        break;
      case '7d':
        from = new Date(now.getTime() - 604800000);
        break;
      default:
        from = new Date(now.getTime() - 86400000);
    }
    params.set('timeFrom', from.toISOString());
  } else if (state.timeFrom) {
    params.set('timeFrom', state.timeFrom);
  }

  return params;
}

/**
 * Simulate the alerts-page load cycle.
 *
 * `trackLocalFilters` models the buggy $effect that reads local filter state
 * inside loadAlerts (via buildFilterParams), so the effect re-runs on dropdown
 * bind — before goto updates the URL — and syncFromUrl clobbers the selection.
 */
export function simulateAlertFilterLoadCycle(opts: {
  url: URLSearchParams;
  /** Local state after dropdown bind:value, before/without URL navigation */
  localAfterBind?: Partial<AlertListFilterState>;
  /**
   * When true, effect re-runs on local filter changes and syncs from (stale) URL.
   * When false, load is driven only by URL (fixed contract).
   */
  trackLocalFilters: boolean;
  nowMs?: number;
}): { filtersUsedForFetch: AlertListFilterState; clobbered: boolean } {
  const nowMs = opts.nowMs ?? Date.now();
  let local: AlertListFilterState = {
    ...DEFAULT_ALERT_LIST_FILTERS,
    ...opts.localAfterBind,
  };
  const before = { ...local };

  const runEffect = () => {
    local = readAlertFiltersFromSearchParams(opts.url, nowMs);
  };

  if (opts.trackLocalFilters) {
    // Local bind changed → effect re-fires while URL still stale
    runEffect();
  } else if (opts.localAfterBind) {
    // Fixed: bind only updates local UI; fetch waits for URL navigation
    const navigated = buildAlertFilterSearchParams(
      { ...DEFAULT_ALERT_LIST_FILTERS, ...opts.localAfterBind },
      nowMs,
    );
    local = readAlertFiltersFromSearchParams(navigated, nowMs);
  } else {
    runEffect();
  }

  const clobbered =
    Boolean(opts.localAfterBind?.severity) &&
    before.severity !== '' &&
    local.severity !== before.severity;

  return { filtersUsedForFetch: local, clobbered };
}
