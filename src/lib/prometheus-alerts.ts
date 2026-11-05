import { createHash } from 'node:crypto';
import type { Alert } from '$lib/alert-manager';
import { SITE_CONFIGS } from '$lib/site-config';
import { fetchAlerts } from '$lib/prometheus';

export function findSiteIdByClusterTag(clusterTag: string): string | undefined {
  for (const [siteId, config] of Object.entries(SITE_CONFIGS)) {
    if (config.clusterTag === clusterTag) return siteId;
  }
  return undefined;
}

function promFingerprint(labels: Record<string, string>): string {
  const key = Object.keys(labels).sort().map((k) => `${k}=${labels[k]}`).join('\0');
  return `prom-${createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
}

/** Map a Prometheus /api/v1/alerts entry to the Alert Center shape. */
export function normalizePrometheusAlert(
  raw: Record<string, unknown>,
  clusterTag: string,
): Alert | null {
  const labels = (raw.labels ?? {}) as Record<string, string>;
  const cluster = labels.cluster ?? labels.kubernetes_cluster ?? '';
  if (cluster !== clusterTag) return null;

  const state = String(raw.state ?? '');
  if (state === 'pending') return null;
  const status = state === 'firing' ? 'firing' : state === 'inactive' ? 'resolved' : null;
  if (!status) return null;

  const annotations = (raw.annotations ?? {}) as Record<string, string>;
  const activeAt = String(raw.activeAt ?? new Date().toISOString());
  const fingerprint = String(raw.fingerprint ?? promFingerprint(labels));

  return {
    id: fingerprint,
    fingerprint,
    status,
    labels,
    annotations,
    startsAt: activeAt,
    endsAt: status === 'resolved' ? String(raw.endsAt ?? new Date().toISOString()) : null,
    generatorURL: String(raw.generatorURL ?? ''),
    receivedAt: new Date().toISOString(),
    acknowledged: false,
  };
}

/** Live Prometheus Alertmanager poll for a cluster when the webhook store is empty. */
export async function fetchPrometheusAlertsForCluster(
  clusterTag: string,
  customFetch: typeof fetch = fetch,
): Promise<Alert[]> {
  const siteId = findSiteIdByClusterTag(clusterTag);
  if (!siteId) return [];

  const alertsUrl = SITE_CONFIGS[siteId]?.alertsUrl;
  if (!alertsUrl) return [];

  const rawList = await fetchAlerts(alertsUrl, customFetch);
  const alerts: Alert[] = [];
  for (const raw of rawList) {
    const normalized = normalizePrometheusAlert(raw as Record<string, unknown>, clusterTag);
    if (normalized) alerts.push(normalized);
  }

  return sortAlerts(alerts);
}

/** Poll all configured Prometheus alert endpoints (deduped by URL). */
export async function fetchAllPrometheusAlerts(
  customFetch: typeof fetch = fetch,
): Promise<Alert[]> {
  const byFingerprint = new Map<string, Alert>();
  const seenUrls = new Set<string>();

  for (const config of Object.values(SITE_CONFIGS)) {
    if (!config.alertsUrl || seenUrls.has(config.alertsUrl)) continue;
    seenUrls.add(config.alertsUrl);

    const rawList = await fetchAlerts(config.alertsUrl, customFetch);
    for (const raw of rawList) {
      const labels = ((raw as Record<string, unknown>).labels ?? {}) as Record<string, string>;
      const cluster = labels.cluster ?? labels.kubernetes_cluster ?? '';
      if (!cluster) continue;
      const normalized = normalizePrometheusAlert(raw as Record<string, unknown>, cluster);
      if (normalized) byFingerprint.set(normalized.fingerprint, normalized);
    }
  }

  return sortAlerts([...byFingerprint.values()]);
}

function sortAlerts(alerts: Alert[]): Alert[] {
  return alerts.sort(
    (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
  );
}
