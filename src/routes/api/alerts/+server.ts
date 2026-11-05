import { json } from '@sveltejs/kit';
import {
  getAlertsFiltered,
  getAlertsBySite,
  getAllAlerts,
  getAlertSummary,
  queryAlertList,
  summarizeAlerts,
  type Alert,
} from '$lib/alert-manager';
import { fetchPrometheusAlertsForCluster, fetchAllPrometheusAlerts } from '$lib/prometheus-alerts';
import { ErrorCode, createErrorResponse } from '$lib/errors';

/**
 * GET /api/alerts — Query alert history with filters and cursor-based pagination.
 *
 * Query params:
 *   site       — Filter by cluster label.
 *   severity   — Filter: 'critical', 'warning', 'info'.
 *   status     — Filter: 'firing', 'resolved', 'all' (default: 'all').
 *   timeFrom   — ISO8601: alerts with startsAt >= this.
 *   timeTo     — ISO8601: alerts with startsAt <= this.
 *   activeFrom — ISO8601: overlap window start (alert active during window).
 *   activeTo   — ISO8601: overlap window end (use with activeFrom).
 *   search     — Text search in alertname + summary.
 *   cursor     — Opaque cursor from previous page for pagination.
 *   limit      — Max results (default: 50, max: 200).
 *
 * Response:
 *   { alerts: Alert[], cursor: string | null, total: number, summary: AlertSummary }
 */
export async function GET({ url, fetch: customFetch }) {
  try {
    const site = url.searchParams.get('site') ?? undefined;
    const severity = url.searchParams.get('severity') ?? undefined;
    const statusParam = url.searchParams.get('status');
    const timeFrom = url.searchParams.get('timeFrom') ?? undefined;
    const timeTo = url.searchParams.get('timeTo') ?? undefined;
    const activeFrom = url.searchParams.get('activeFrom') ?? undefined;
    const activeTo = url.searchParams.get('activeTo') ?? undefined;
    const search = url.searchParams.get('search') ?? undefined;
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitParam = url.searchParams.get('limit');

    // Validate status
    const status = (statusParam && ['firing', 'resolved', 'all'].includes(statusParam))
      ? statusParam
      : 'all';

    // Parse limit
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const filters = {
      site,
      severity,
      status,
      timeFrom,
      timeTo,
      activeFrom,
      activeTo,
      search,
      cursor,
      limit: isNaN(limit) ? 50 : limit,
    };

    let source: Alert[] | undefined;
    let usedPrometheus = false;
    const webhookStoreEmpty = getAllAlerts().length === 0;

    // Webhook store empty — fall back to live Prometheus (same source as site detail / site cards).
    if (site && getAlertsBySite(site).length === 0) {
      const promAlerts = await fetchPrometheusAlertsForCluster(site, customFetch);
      if (promAlerts.length > 0) {
        source = promAlerts;
        usedPrometheus = true;
      }
    } else if (!site && webhookStoreEmpty) {
      const promAlerts = await fetchAllPrometheusAlerts(customFetch);
      if (promAlerts.length > 0) {
        source = promAlerts;
        usedPrometheus = true;
      }
    }

    const result = source ? queryAlertList(source, filters) : getAlertsFiltered(filters);

    // Attach summary: global store counts, or Prometheus counts when that was the source.
    const summary = usedPrometheus && source
      ? summarizeAlerts(source)
      : getAlertSummary();

    return json({ ...result, summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return json(createErrorResponse(ErrorCode.INTERNAL_ERROR, msg), { status: 500 });
  }
}
