/**
 * Formatting helpers for site-health export payloads.
 * Local export error codes for the health export panel.
 */

export type ExportErrorCode =
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'UPSTREAM_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'TIMEOUT';

/** Map HTTP status codes used by the export panel. */
export function mapHttpStatusToExportCode(status: number): ExportErrorCode {
  if (status === 404) return 'NOT_FOUND';
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 408 || status === 504) return 'TIMEOUT';
  if (status >= 500) return 'UPSTREAM_ERROR';
  return 'INTERNAL_ERROR';
}

export function formatExportError(status: number, message: string) {
  return {
    error: message || `HTTP ${status}`,
    code: mapHttpStatusToExportCode(status),
  };
}

/** Pretty-print saturation metrics for export summaries. */
export function formatSaturationLabel(metric: string, value: number): string {
  if (metric === 'memory' && value > 100) {
    const gi = value / (1024 * 1024 * 1024);
    return gi >= 1 ? `${gi.toFixed(1)} GiB` : `${Math.round(value / (1024 * 1024))} MiB`;
  }
  return `${Math.round(value)}${metric === 'restarts' ? '' : '%'}`;
}
