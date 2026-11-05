/** Site Health Brief helpers (ADR-0017 / ADR-0020). Generate uses Orchestrator Chat Contract. */

export const SITE_HEALTH_REPORT_PROMPT =
  '請根據目前綁定站點的資源健康與目前 firing 告警，撰寫一份簡要健康與 RCA 診斷報告。用繁體中文。先寫視覺摘要：用 markdown 標題（# / ##）分段，用 markdown 表格列出數據，並用獨立行「重點：」「提示：」「風險：」「建議：」寫短句。不要用 **粗體** 當標題。然後另起一行，標題恰好為「詳細資料」（可寫成 ## 詳細資料），其後才寫較長說明；沒有額外細節可省略該段。不要輸出 rca 圍欄區塊。';

export function reportIsStale(metricsAt: string, reportAt: string): boolean {
  if (!metricsAt || !reportAt) return false;
  const m = Date.parse(metricsAt);
  const r = Date.parse(reportAt);
  if (!Number.isFinite(m) || !Number.isFinite(r)) return false;
  return m > r;
}

export function primarySaturation(health: {
  sections: Array<{
    available: boolean;
    saturation: { cpu: number | null; memory: number | null; disk: number | null } | null;
  }>;
} | null): { cpu: number | null; memory: number | null; disk: number | null } {
  const section = health?.sections.find((s) => s.available && s.saturation) ?? health?.sections[0];
  return {
    cpu: section?.saturation?.cpu ?? null,
    memory: section?.saturation?.memory ?? null,
    disk: section?.saturation?.disk ?? null,
  };
}

export function formatOffenderValue(item: { metric: string; value: number }): string {
  if (item.metric === 'memory' && item.value > 100) {
    const gi = item.value / (1024 * 1024 * 1024);
    return gi >= 1 ? `${gi.toFixed(1)} GiB` : `${Math.round(item.value / (1024 * 1024))} MiB`;
  }
  return `${Math.round(item.value)}${item.metric === 'restarts' ? '' : '%'}`;
}
