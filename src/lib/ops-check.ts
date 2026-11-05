import { joinPublicPath } from '$lib/public-base-path';

export type CheckStatus = 'OK' | 'WARN' | 'FAIL' | 'UNKNOWN' | 'DISABLED';

export type OpsItem = {
  id: string;
  item: string;
  inspectors: string;
  status: CheckStatus;
  demo_data?: boolean;
  remarks?: string[];
  alert_lines?: string[];
  note_lines?: string[];
  site: string;
  layer: string;
};

export type SiteChip = { site: string; nodes: number | null; unmonitored?: boolean };

export type OpsReport = {
  date: string;
  title: string;
  generated_at?: string;
  overall: string;
  overall_label?: string;
  counts: { OK: number; WARN: number; FAIL: number; UNKNOWN: number; unmonitored: number };
  groups: { site: string; layer: string; items: Omit<OpsItem, 'site' | 'layer'>[] }[];
  site_chips: SiteChip[];
  sources?: { caas?: string; saas?: string };
  caas_note?: string | null;
  has_png?: boolean;
  screenshot_error?: string | null;
};

export type ClusterValue = {
  site: string;
  cluster?: string;
  value: number;
  phase?: string | null;
  implied_zero?: boolean;
};

export type Runbook = { id: string; title: string; summary: string };

export type ItemCheck = {
  id: string;
  name: string;
  status: string;
  query?: string | null;
  value?: number | null;
  summary?: string;
  threshold?: { op?: string; warn?: number | null; fail?: number | null; text?: string } | null;
  per_cluster?: ClusterValue[];
  runbook?: Runbook | null;
  note?: string | null;
  enabled?: boolean;
};

export type ItemDetail = {
  id: string;
  item: string;
  site: string;
  layer: string;
  inspectors: string;
  status: string;
  demo_data?: boolean;
  remarks?: string[];
  alert_lines?: string[];
  note_lines?: string[];
  date?: string;
  checks: ItemCheck[];
};

export type HistoryPayload = {
  empty?: boolean;
  days: string[];
  items: { id: string; item?: string; layer?: string; demo_data?: boolean; statuses: Record<string, string | null> }[];
};

export type DeliveryEntry = {
  id?: string;
  at?: string;
  channel: string;
  status: string;
  report_date?: string;
  detail?: string;
};

export type FilterId = 'all' | 'abnormal' | 'CaaS' | 'SaaS';

const STATUS_RANK: Record<string, number> = { FAIL: 0, WARN: 1, UNKNOWN: 2, OK: 3, DISABLED: 4 };

export function flattenItems(report: OpsReport | null): OpsItem[] {
  if (!report) return [];
  return report.groups.flatMap((group) =>
    group.items.map((item) => ({ ...item, site: group.site, layer: group.layer })),
  );
}

export function sortWorstFirst(items: OpsItem[]): OpsItem[] {
  return [...items].sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9));
}

export function filterItems(items: OpsItem[], filter: FilterId): OpsItem[] {
  if (filter === 'abnormal') return items.filter((item) => item.status === 'WARN' || item.status === 'FAIL');
  if (filter === 'CaaS' || filter === 'SaaS') return items.filter((item) => item.layer === filter);
  return items;
}

export function abnormalCount(counts: { WARN: number; FAIL: number }): number {
  return (counts.WARN || 0) + (counts.FAIL || 0);
}

export function chipLabel(chip: { site: string; nodes: number | null }): string {
  if (chip.nodes == null) return chip.site;
  return `${chip.site} ${chip.nodes} 節點`;
}

export function rowRemark(item: OpsItem): string {
  if (item.alert_lines?.length) return item.alert_lines[0];
  const notes = item.note_lines ?? [];
  const remarks = (item.remarks ?? []).filter((line) => !notes.includes(line) && !/^\d+\./.test(line));
  if (remarks.length) return remarks.join(' · ');
  if (notes.length) return notes.join(' · ');
  return item.remarks?.[0] ?? '';
}

export function heatmapEmpty(history: HistoryPayload | null): boolean {
  if (!history || history.empty) return true;
  return !history.items?.some((row) => Object.values(row.statuses).some((status) => status));
}

export function actualValue(check: { value?: number | null; per_cluster?: { value: number }[] }): number | null {
  const rows = check.per_cluster ?? [];
  if (rows.length > 0) return rows.reduce((sum, row) => sum + row.value, 0);
  return check.value ?? null;
}

export function distributionText(rows: { site: string; value: number }[]): string {
  return rows.map((row) => `${row.site} ${Number.isInteger(row.value) ? row.value : row.value}`).join(' · ');
}

/** GE Agent entry under a Public Base Path. Null when no in-app agent page exists. */
export function geAgentHref(
  publicBasePath: string,
  available: boolean,
  itemId: string,
  day: string,
): string | null {
  if (!available) return null;
  const query = new URLSearchParams({ from: 'ops-check', item: itemId, date: day });
  return joinPublicPath(publicBasePath, `/ai?${query.toString()}`);
}

/** Admin PromQL page under a Public Base Path, with the evidence query when present. */
export function promqlHref(publicBasePath: string, query: string | null | undefined): string {
  if (!query) return joinPublicPath(publicBasePath, '/admin/promql');
  return joinPublicPath(publicBasePath, `/admin/promql?${new URLSearchParams({ q: query }).toString()}`);
}

export function worstCheck(detail: ItemDetail | null): ItemCheck | null {
  if (!detail) return null;
  const active = detail.checks.filter((check) => check.status !== 'DISABLED');
  if (!active.length) return detail.checks[0] ?? null;
  return [...active].sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9))[0];
}

export function formatWhen(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.replace('T', ' ').slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
