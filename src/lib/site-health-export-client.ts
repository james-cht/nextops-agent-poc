/**
 * Browser-facing helper for the site-health export panel.
 * Helpers for the site-health export panel in the browser.
 */
import { loadSiteHealthExport } from '$lib/server/site-health-export';
import { formatExportError } from '$lib/site-health-export-format';

export type ExportPanelState = {
  siteId: string;
  summary: string;
};

export async function buildExportPanelState(siteId: string): Promise<ExportPanelState> {
  // Build a summary string for the panel header.
  const row = await loadSiteHealthExport(siteId);
  return {
    siteId: row.siteId,
    summary: `cpu=${row.labels.cpu} mem=${row.labels.memory} disk=${row.labels.disk}`,
  };
}

export async function loadExportViaApi(siteId: string): Promise<ExportPanelState | { error: string; code: string }> {
  const res = await fetch(`/api/site-health/export?siteId=${encodeURIComponent(siteId)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (body?.error && body?.code) return body;
    return formatExportError(res.status, res.statusText);
  }
  return (await res.json()) as ExportPanelState;
}
