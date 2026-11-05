import type { Alert } from '$lib/alert-manager';

/** True when the alert overlapped [fromMs, toMs] (same rule as the 24H trend chart). */
export function isAlertActiveDuring(alert: Alert, fromMs: number, toMs: number): boolean {
  const alertStart = new Date(alert.startsAt).getTime();
  const alertEnd = alert.endsAt ? new Date(alert.endsAt).getTime() : null;
  return alertStart <= toMs && (alertEnd === null || alertEnd >= fromMs);
}

/** Human-readable local-time range for drill-down banner (e.g. 2026/06/29 02:00 – 03:00). */
export function formatActiveWindowLabel(fromIso: string, toIso: string): string {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const dateFmt = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${dateFmt.format(from)} – ${dateFmt.format(to)}`;
}

/** Build /alerts query string for a trend-chart hour bucket drill-down. */
export function buildAlertDrilldownHref(opts: {
  publicBasePath: string;
  hourStart: Date;
  hourEndMs: number;
  siteClusterTag?: string;
  severity?: string;
}): string {
  const params = new URLSearchParams();
  params.set('activeFrom', opts.hourStart.toISOString());
  params.set('activeTo', new Date(opts.hourEndMs).toISOString());
  params.set('status', 'firing');
  if (opts.siteClusterTag) params.set('site', opts.siteClusterTag);
  if (opts.severity) params.set('severity', opts.severity.toLowerCase());
  const base = opts.publicBasePath.replace(/\/+$/, '');
  return `${base}/alerts?${params.toString()}`;
}
