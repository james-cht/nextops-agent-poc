import type { Alert, AlertSummary } from '$lib/alert-manager';
import { base } from '$app/paths';
import { isAlertActiveDuring } from '$lib/alert-active-window';

export type { AlertStreamEvent };

export interface AlertListFilters {
  site?: string;
  severity?: string;
  status?: string;
  search?: string;
  timeFromMs?: number;
  activeFromMs?: number;
  activeToMs?: number;
}

/**
 * Connect to the alert SSE stream.
 *
 * @param siteFilter Optional cluster tag to filter by site.
 * @param handlers Object with onSnapshot, onAlert, onAck callbacks.
 * @returns Cleanup function to close the connection.
 */
export function connectAlertStream(
  siteFilter: string | null,
  handlers: {
    onSnapshot: (alerts: Alert[], summary: AlertSummary, unacked: number) => void;
    onAlert: (alert: Alert, summary: AlertSummary, unacked: number) => void;
    onAck?: (fingerprint: string | null, summary: AlertSummary, unacked: number) => void;
    onError?: (err: Event) => void;
  }
): () => void {
  const params = siteFilter ? `?site=${encodeURIComponent(siteFilter)}` : '';
  const prefix = base.replace(/\/+$/, '');
  const eventSource = new EventSource(`${prefix}/api/alerts/stream${params}`);

  eventSource.onmessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as AlertStreamEvent;
      if (data.type === 'snapshot') {
        handlers.onSnapshot(data.alerts, data.summary, data.unacked);
      } else if (data.type === 'alert') {
        handlers.onAlert(data.alert, data.summary, data.unacked);
      } else if (data.type === 'ack' || data.type === 'ack_all') {
        handlers.onAck?.(
          data.type === 'ack' ? data.fingerprint : null,
          data.summary,
          data.unacked,
        );
      }
      // heartbeat events are silently ignored (no-op keepalive)
    } catch {
      // Ignore malformed messages
    }
  };

  eventSource.onerror = (err: Event) => {
    handlers.onError?.(err);
    // EventSource auto-reconnects
  };

  return () => {
    eventSource.close();
  };
}

/**
 * Compute aggregate alert summary from a list of alerts.
 * Useful for computing counts client-side after receiving a snapshot.
 */
export function computeSummary(alerts: Alert[]): AlertSummary {
  let firing = 0;
  let critical = 0;
  let warning = 0;
  let info = 0;

  for (const a of alerts) {
    if (a.status === 'firing') {
      firing++;
      const sev = (a.labels.severity ?? '').toLowerCase();
      if (sev === 'critical') critical++;
      else if (sev === 'warning') warning++;
      else info++;
    }
  }

  return {
    total: alerts.length,
    firing,
    critical,
    warning,
    info,
  };
}

/** Whether an alert matches the active list filters on the alerts page. */
export function alertMatchesFilters(alert: Alert, filters: AlertListFilters): boolean {
  if (filters.site) {
    const cluster = alert.labels.cluster ?? alert.labels.kubernetes_cluster ?? '';
    if (cluster !== filters.site) return false;
  }

  if (filters.severity) {
    if ((alert.labels.severity ?? '').toLowerCase() !== filters.severity.toLowerCase()) {
      return false;
    }
  }

  if (filters.status && filters.status !== 'all' && alert.status !== filters.status) {
    return false;
  }

  if (filters.timeFromMs !== undefined) {
    if (new Date(alert.startsAt).getTime() < filters.timeFromMs) return false;
  }

  if (filters.activeFromMs !== undefined && filters.activeToMs !== undefined) {
    if (!isAlertActiveDuring(alert, filters.activeFromMs, filters.activeToMs)) return false;
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    const alertname = (alert.labels.alertname ?? '').toLowerCase();
    const summary = (alert.annotations.summary ?? '').toLowerCase();
    const desc = (alert.annotations.description ?? '').toLowerCase();
    if (!alertname.includes(q) && !summary.includes(q) && !desc.includes(q)) return false;
  }

  return true;
}

/**
 * Upsert a streamed alert into a filtered list.
 * Returns the updated list and whether totalCount should change.
 */
export function upsertStreamAlert(
  list: Alert[],
  alert: Alert,
  matches: boolean,
): { alerts: Alert[]; totalDelta: number } {
  const index = list.findIndex((a) => a.fingerprint === alert.fingerprint);

  if (index !== -1) {
    if (!matches) {
      return { alerts: list.filter((_, i) => i !== index), totalDelta: -1 };
    }
    const next = [...list];
    next[index] = alert;
    return { alerts: next, totalDelta: 0 };
  }

  if (matches) {
    return { alerts: [alert, ...list], totalDelta: 1 };
  }

  return { alerts: list, totalDelta: 0 };
}
