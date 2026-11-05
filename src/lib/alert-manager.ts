/**
 * Alert Manager — In-memory alert store with deduplication, TTL, and SSE broadcast.
 *
 * V1: single-instance in-memory. Move to Redis for multi-instance deployments.
 *
 * Alertmanager webhook payload shape (simplified):
 * {
 *   alerts: Array<{
 *     status: 'firing' | 'resolved',
 *     labels: Record<string, string>,
 *     annotations: Record<string, string>,
 *     startsAt: string,
 *     endsAt: string,
 *     generatorURL: string,
 *     fingerprint: string
 *   }>
 * }
 */

import { isAlertActiveDuring } from '$lib/alert-active-window';

export interface Alert {
  id: string;                    // fingerprint from Alertmanager
  status: 'firing' | 'resolved';
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt: string | null;
  generatorURL: string;
  fingerprint: string;
  receivedAt: string;            // when the webhook received it (ISO)
  acknowledged: boolean;         // user acknowledged / marked as read
}

export interface AlertSummary {
  total: number;
  firing: number;
  critical: number;
  warning: number;
  info: number;
}

export type AlertStreamEvent =
  | { type: 'snapshot'; alerts: Alert[]; summary: AlertSummary; unacked: number }
  | { type: 'alert'; alert: Alert; summary: AlertSummary; unacked: number }
  | { type: 'ack'; fingerprint: string; summary: AlertSummary; unacked: number }
  | { type: 'ack_all'; summary: AlertSummary; unacked: number }
  | { type: 'heartbeat'; ts: string };

const RESOLVED_TTL_MS = 24 * 60 * 60 * 1000;  // 24 hours for resolved alerts

// In-memory store: Map<fingerprint, Alert>
const alerts = new Map<string, Alert>();

// SSE client connections: Set of ReadableStream controllers
type StreamController = ReadableStreamDefaultController<string>;
const clients = new Set<StreamController>();

// Prune interval handle
let pruneInterval: ReturnType<typeof setInterval> | null = null;

// ── Public API ──────────────────────────────────────────────────────

/**
 * Ingest an array of alerts from an Alertmanager webhook payload.
 * Deduplicates by fingerprint: updates existing entries rather than
 * appending duplicates. Returns the count of new/updated alerts.
 */
export function ingestAlerts(alertList: Alert[]): number {
  let count = 0;
  for (const a of alertList) {
    const existing = alerts.get(a.fingerprint);
    if (existing && existing.status === a.status) {
      // Update annotations/labels in case they changed, but keep receivedAt
      existing.labels = a.labels;
      existing.annotations = a.annotations;
      existing.endsAt = a.endsAt;
      continue;
    }
    // New alert or status change (firing→resolved or resolved→firing)
    const stored: Alert = {
      id: a.fingerprint,
      status: a.status,
      labels: a.labels,
      annotations: a.annotations,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      generatorURL: a.generatorURL,
      fingerprint: a.fingerprint,
      receivedAt: a.receivedAt || new Date().toISOString(),
      acknowledged: resolveAcknowledged(existing, a),
    };
    alerts.set(a.fingerprint, stored);
    count++;

    // Broadcast to SSE clients
    broadcastAlert(stored);
  }
  return count;
}

/**
 * Get all current alerts, newest first.
 */
export function getAllAlerts(): Alert[] {
  return Array.from(alerts.values()).sort(
    (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
  );
}

/**
 * Get alerts filtered by site (cluster label match), newest first.
 */
export function getAlertsBySite(siteClusterTag: string): Alert[] {
  return getAllAlerts().filter(a => {
    const cluster = a.labels.cluster ?? a.labels.kubernetes_cluster ?? '';
    return cluster === siteClusterTag;
  });
}

export interface AlertFilters {
  site?: string;
  severity?: string;
  status?: string;
  timeFrom?: string;
  timeTo?: string;
  activeFrom?: string;
  activeTo?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export function getAlertsFiltered(filters: AlertFilters): {
  alerts: Alert[];
  cursor: string | null;
  total: number;
} {
  return queryAlertList(getAllAlerts(), filters);
}

/** Filter and paginate an arbitrary alert list (e.g. Prometheus fallback). */
export function queryAlertList(alerts: Alert[], filters: AlertFilters): {
  alerts: Alert[];
  cursor: string | null;
  total: number;
} {
  let result = [...alerts];

  // Filter by site
  if (filters.site) {
    const site = filters.site;
    result = result.filter(a => {
      const cluster = a.labels.cluster ?? a.labels.kubernetes_cluster ?? '';
      return cluster === site;
    });
  }

  // Filter by severity
  if (filters.severity) {
    const sev = filters.severity.toLowerCase();
    result = result.filter(a => (a.labels.severity ?? '').toLowerCase() === sev);
  }

  // Filter by status (firing / resolved)
  if (filters.status && filters.status !== 'all') {
    result = result.filter(a => a.status === filters.status);
  }

  // Filter by startsAt range (alert started within window)
  if (filters.timeFrom) {
    const from = new Date(filters.timeFrom).getTime();
    result = result.filter(a => new Date(a.startsAt).getTime() >= from);
  }
  if (filters.timeTo) {
    const to = new Date(filters.timeTo).getTime();
    result = result.filter(a => new Date(a.startsAt).getTime() <= to);
  }

  // Filter by overlap window (alert active at any point during [activeFrom, activeTo])
  if (filters.activeFrom && filters.activeTo) {
    const from = new Date(filters.activeFrom).getTime();
    const to = new Date(filters.activeTo).getTime();
    result = result.filter(a => isAlertActiveDuring(a, from, to));
  }

  // Full-text search on alertname, summary, description
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(a => {
      const alertname = (a.labels.alertname ?? '').toLowerCase();
      const summary = (a.annotations.summary ?? '').toLowerCase();
      const desc = (a.annotations.description ?? '').toLowerCase();
      return alertname.includes(q) || summary.includes(q) || desc.includes(q);
    });
  }

  const total = result.length;

  // Cursor-based pagination
  const limit = Math.min(filters.limit ?? 50, 200);
  if (filters.cursor) {
    const cursorIdx = result.findIndex(a => a.fingerprint === filters.cursor);
    if (cursorIdx !== -1) {
      result = result.slice(cursorIdx + 1);
    }
  }

  const page = result.slice(0, limit);
  const nextCursor = result.length > limit ? page[page.length - 1]?.fingerprint ?? null : null;

  return { alerts: page, cursor: nextCursor, total };
}

/** Build summary counts from an alert list (firing severity breakdown). */
export function summarizeAlerts(alerts: Alert[]): AlertSummary {
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

  return { total: alerts.length, firing, critical, warning, info };
}

/**
 * Get a summary of the current alert state.
 */
export function getAlertSummary(): AlertSummary {
  let firing = 0;
  let critical = 0;
  let warning = 0;
  let info = 0;

  for (const a of alerts.values()) {
    if (a.status === 'firing') {
      firing++;
      const sev = (a.labels.severity ?? '').toLowerCase();
      if (sev === 'critical') critical++;
      else if (sev === 'warning') warning++;
      else info++;
    }
  }

  return {
    total: alerts.size,
    firing,
    critical,
    warning,
    info,
  };
}

/**
 * Get count of unacknowledged (firing) alerts.
 */
export function getUnackedCount(): number {
  let count = 0;
  for (const a of alerts.values()) {
    if (a.status === 'firing' && !a.acknowledged) count++;
  }
  return count;
}

/**
 * Acknowledge a single alert by fingerprint.
 * Returns true if the alert was found and updated.
 */
export function acknowledgeAlert(fingerprint: string): boolean {
  const alert = alerts.get(fingerprint);
  if (!alert) return false;
  alert.acknowledged = true;
  broadcastAck(fingerprint);
  return true;
}

/**
 * Acknowledge all currently firing alerts.
 * Returns the number of alerts acknowledged.
 */
export function acknowledgeAll(): number {
  let count = 0;
  for (const a of alerts.values()) {
    if (a.status === 'firing' && !a.acknowledged) {
      a.acknowledged = true;
      count++;
    }
  }
  if (count > 0) {
    broadcastAckAll();
  }
  return count;
}

/**
 * Current snapshot payload for SSE connect and client hydration.
 */
export function getSnapshot(alertsList?: Alert[]): AlertStreamEvent {
  const list = alertsList ?? getAllAlerts();
  return {
    type: 'snapshot',
    alerts: list,
    summary: getAlertSummary(),
    unacked: getUnackedCount(),
  };
}

/**
 * Register an SSE client. Returns a cleanup function that removes it.
 */
export function addClient(controller: StreamController): () => void {
  clients.add(controller);
  return () => {
    clients.delete(controller);
  };
}

/**
 * Start the periodic resolved-alert pruner. Call once at server init.
 */
export function startPruneInterval(): void {
  if (pruneInterval) return;
  pruneInterval = setInterval(pruneResolved, RESOLVED_TTL_MS);
}

/**
 * Stop the pruner (cleanup on server shutdown).
 */
export function stopPruneInterval(): void {
  if (pruneInterval) {
    clearInterval(pruneInterval);
    pruneInterval = null;
  }
}

// ── Internal ────────────────────────────────────────────────────────

/** Preserve ack on resolve; reset ack when an alert re-fires. */
function resolveAcknowledged(existing: Alert | undefined, incoming: Alert): boolean {
  if (!existing) return false;
  if (incoming.status === 'firing' && existing.status === 'resolved') return false;
  return existing.acknowledged;
}

function broadcastEvent(event: AlertStreamEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const ctrl of clients) {
    try {
      ctrl.enqueue(data);
    } catch {
      clients.delete(ctrl);
    }
  }
}

function broadcastAlert(alert: Alert): void {
  broadcastEvent({
    type: 'alert',
    alert,
    summary: getAlertSummary(),
    unacked: getUnackedCount(),
  });
}

function broadcastAck(fingerprint: string): void {
  broadcastEvent({
    type: 'ack',
    fingerprint,
    summary: getAlertSummary(),
    unacked: getUnackedCount(),
  });
}

function broadcastAckAll(): void {
  broadcastEvent({
    type: 'ack_all',
    summary: getAlertSummary(),
    unacked: getUnackedCount(),
  });
}

function pruneResolved(): void {
  const now = Date.now();
  for (const [fp, a] of alerts) {
    if (a.status === 'resolved') {
      const endTime = a.endsAt ? new Date(a.endsAt).getTime() : now;
      if (now - endTime > RESOLVED_TTL_MS) {
        alerts.delete(fp);
      }
    }
  }
}
