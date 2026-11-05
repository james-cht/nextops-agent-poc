import type { SiteCatalogEntry } from './site-catalog-contract';

export const ROBUSTA_HISTORY_WINDOW_HOURS = [24, 48, 168] as const;
export type RobustaHistoryWindowHours = (typeof ROBUSTA_HISTORY_WINDOW_HOURS)[number];

export const DEFAULT_ROBUSTA_HISTORY_WINDOW_HOURS: RobustaHistoryWindowHours = 168;
export const ROBUSTA_HISTORY_PAGE_SIZE = 50;
export const ROBUSTA_HISTORY_SITE_STORAGE_KEY = 'nextops-robusta-site';

export const GENERATE_HINT_TEXT =
  '可依目前 Cluster Operations Snapshot 生成調查建議報告。';

export function siteHasRobustaHistory(entry: {
  robustaCoverage: boolean;
  robustaClusterKey: string;
}): boolean {
  return entry.robustaCoverage === true && entry.robustaClusterKey.trim().length > 0;
}

/** Exactly one covered Site with a Cluster Key → auto-select it; otherwise null. */
export function defaultRobustaHistorySiteId(sites: SiteCatalogEntry[]): string | null {
  const covered = sites.filter(siteHasRobustaHistory);
  return covered.length === 1 ? covered[0].siteId : null;
}

/**
 * URL wins. Else auto-select the sole covered Site. Else restore this Session.
 * Otherwise wait for a pick (empty string — not list[0], not 未佈署).
 */
export function pickRobustaHistorySiteId(
  sites: SiteCatalogEntry[],
  fromUrl: string,
  remembered: string,
): string {
  if (fromUrl && sites.some((s) => s.siteId === fromUrl)) return fromUrl;
  const sole = defaultRobustaHistorySiteId(sites);
  if (sole) return sole;
  if (remembered && sites.some((s) => s.siteId === remembered)) return remembered;
  return '';
}

export function parseRobustaHistoryWindowHours(
  raw: string | null | undefined,
): RobustaHistoryWindowHours {
  const n = parseInt(raw ?? '', 10);
  if ((ROBUSTA_HISTORY_WINDOW_HOURS as readonly number[]).includes(n)) {
    return n as RobustaHistoryWindowHours;
  }
  return DEFAULT_ROBUSTA_HISTORY_WINDOW_HOURS;
}

export const ROBUSTA_AUTOSCALE_KIND = 'cpu_autoscale';
export const ROBUSTA_AUTOSCALE_SUCCESS_STATUS = 'scaled';
export const ROBUSTA_HISTORY_KIND_PARAM = 'kind';
export const ROBUSTA_HISTORY_CPU_SUCCESS_PARAM = 'cpuSuccess';

export const ROBUSTA_HISTORY_KINDS = [
  'container_restart',
  'cpu_autoscale',
  'java_oom',
  'memory_diagnose',
  'pod_crash',
] as const;

export type RobustaHistoryKind = (typeof ROBUSTA_HISTORY_KINDS)[number];

export type RobustaHistoryKindFilter = {
  kind: string;
  cpuSuccess: boolean;
} | null;

export function parseRobustaHistoryKindFilter(
  kindRaw: string | null | undefined,
  cpuSuccessRaw: string | null | undefined,
  knownKinds: readonly string[] = ROBUSTA_HISTORY_KINDS,
): RobustaHistoryKindFilter {
  const kind = (kindRaw ?? '').trim();
  if (!kind || !(knownKinds as readonly string[]).includes(kind)) return null;
  const cpuSuccess =
    kind === ROBUSTA_AUTOSCALE_KIND &&
    (cpuSuccessRaw === '1' || cpuSuccessRaw === 'true' || cpuSuccessRaw === 'success');
  return { kind, cpuSuccess };
}

/** Chip click: cpu_autoscale cycles all ↔ success; other kinds toggle on/off. */
export function nextRobustaHistoryKindFilter(
  current: RobustaHistoryKindFilter,
  clickedKind: string,
): RobustaHistoryKindFilter {
  const kind = clickedKind.trim();
  if (!kind) return current;
  if (kind === ROBUSTA_AUTOSCALE_KIND) {
    if (!current || current.kind !== ROBUSTA_AUTOSCALE_KIND) {
      return { kind: ROBUSTA_AUTOSCALE_KIND, cpuSuccess: false };
    }
    return { kind: ROBUSTA_AUTOSCALE_KIND, cpuSuccess: !current.cpuSuccess };
  }
  if (current?.kind === kind) return null;
  return { kind, cpuSuccess: false };
}

export function parseRobustaHistoryPage(raw: string | null | undefined): number {
  const n = parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export type RobustaHistoryHrefOpts = {
  siteId: string;
  windowHours: RobustaHistoryWindowHours | number;
  page: number;
  kindFilter: RobustaHistoryKindFilter;
};

/**
 * Robusta 調查歷史 URL under a Public Base Path. Empty prefix returns the
 * host-root form (`/robusta?…`); a shared-host prefix like `/nextops` returns
 * `/nextops/robusta?…`. Never emits an unprefixed path when base is set —
 * that would silently escape the app on shared hosts (ADR-0035).
 */
export function robustaHistoryHref(publicBasePath: string, opts: RobustaHistoryHrefOpts): string {
  const params = new URLSearchParams();
  if (opts.siteId) params.set('siteId', opts.siteId);
  params.set('windowHours', String(opts.windowHours));
  params.set('page', String(opts.page));
  if (opts.kindFilter) {
    params.set(ROBUSTA_HISTORY_KIND_PARAM, opts.kindFilter.kind);
    if (opts.kindFilter.cpuSuccess) params.set(ROBUSTA_HISTORY_CPU_SUCCESS_PARAM, '1');
  }
  const base = publicBasePath.replace(/\/+$/, '');
  return `${base}/robusta?${params.toString()}`;
}
