/** Bounded Log Analysis — selection, projection, prompt, Suggestion Marker (ADR-0025). */

import { getByPath } from './log-summary-projection.ts';
import { headingLabel } from './diagnosis-answer-view.ts';

export const BOUNDED_LOG_ANALYSIS_MAX = 20;
export const BOUNDED_LOG_MESSAGE_MAX = 4096;
export const SUGGESTION_MARKER = '建議提問';

export type LogSelectionOk = { ok: true; selected: string[] };
export type LogSelectionCap = {
  ok: false;
  code: 'CAP_EXCEEDED';
  selected: string[];
  max: number;
};

export type LogSelectionResult = LogSelectionOk | LogSelectionCap;

export type CompactLogDocument = Record<string, unknown>;

/** Toggle one hit id in/out of the selection; hard-caps at {@link BOUNDED_LOG_ANALYSIS_MAX}. */
export function toggleLogSelection(
  selected: readonly string[],
  id: string,
): LogSelectionResult {
  if (selected.includes(id)) {
    return { ok: true, selected: selected.filter((x) => x !== id) };
  }
  if (selected.length >= BOUNDED_LOG_ANALYSIS_MAX) {
    return {
      ok: false,
      code: 'CAP_EXCEEDED',
      selected: [...selected],
      max: BOUNDED_LOG_ANALYSIS_MAX,
    };
  }
  return { ok: true, selected: [...selected, id] };
}

/** Clear all selected log ids. */
export function clearLogSelection(): LogSelectionOk {
  return { ok: true, selected: [] };
}

/**
 * Select-all for Bounded Log Analysis: first {@link BOUNDED_LOG_ANALYSIS_MAX} ids
 * in buffer order. `truncated` is true when the buffer was larger than the cap.
 */
export function selectFirstLogIds(
  bufferIds: readonly string[],
  max: number = BOUNDED_LOG_ANALYSIS_MAX,
): { selected: string[]; truncated: boolean } {
  const selected = bufferIds.slice(0, Math.max(0, max));
  return { selected, truncated: bufferIds.length > selected.length };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function truncateMessage(raw: string, max: number): string {
  return raw.length > max ? `${raw.slice(0, max)}…` : raw;
}

function firstMessage(source: Record<string, unknown>): string {
  for (const path of ['message', 'message_log'] as const) {
    const v = source[path];
    if (typeof v === 'string' && v.trim()) return v;
  }
  const log = source.log;
  if (typeof log === 'string' && log.trim()) return log;
  return '';
}

const OBJECT_ROOTS = ['kubernetes', 'http', 'error', 'exception'] as const;

const SCALAR_PATHS = [
  'level',
  'log.level',
  'container.name',
  'process.name',
  'status',
  'user_agent',
  'user_agent.original',
  'url.path',
  'path',
  'method',
] as const;

/** Allowlisted compact projection + per-document message cap — not full `_source`. */
export function projectCompactLogDocument(
  source: unknown,
  messageMax = BOUNDED_LOG_MESSAGE_MAX,
): CompactLogDocument {
  const s = asObject(source) ?? {};
  const out: CompactLogDocument = {};

  const ts = getByPath(s, '@timestamp');
  if (ts !== undefined && ts !== null && ts !== '') {
    out['@timestamp'] = ts;
  }

  for (const root of OBJECT_ROOTS) {
    const v = asObject(s[root]);
    if (v) out[root] = cloneJson(v);
  }

  const logObj = asObject(s.log);
  if (logObj) {
    const level = logObj.level ?? logObj.logger;
    if (level !== undefined && level !== null && level !== '') {
      out.log = { level };
    }
  }

  for (const path of SCALAR_PATHS) {
    if (path === 'log.level' && out.log) continue;
    const v = getByPath(s, path);
    if (v === undefined || v === null || v === '') continue;
    if (path.includes('.')) {
      const [root, ...rest] = path.split('.');
      const leaf = rest.join('.');
      const prev = asObject(out[root]) ?? {};
      out[root] = { ...prev, [leaf]: v };
    } else {
      out[path] = v;
    }
  }

  const msg = firstMessage(s);
  if (msg) out.message = truncateMessage(msg, messageMax);

  return out;
}

/** Split Diagnosis Answer on Suggestion Marker 「建議提問」 (one question per following line). */
export function splitSuggestionMarker(raw: string): {
  answer: string;
  suggestions: string[];
} {
  const text = raw.replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const idx = lines.findIndex((line) => headingLabel(line) === SUGGESTION_MARKER);
  if (idx === -1) return { answer: text.trim(), suggestions: [] };

  const answer = lines.slice(0, idx).join('\n').trim();
  const suggestions = lines
    .slice(idx + 1)
    .map((line) =>
      line
        .trim()
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+[.)]\s+/, '')
        .trim(),
    )
    .filter(Boolean);

  return { answer, suggestions };
}

/** Build the Orchestrator turn query that embeds compact log JSON. */
export function buildBoundedLogAnalysisPrompt(
  docs: readonly CompactLogDocument[],
  siteTitle: string,
): string {
  const label = siteTitle.trim() || '未知站點';
  return [
    `請分析下列來自站點「${label}」的日誌（已精簡投影，共 ${docs.length} 筆）。`,
    '請總結可能根因、影響面與建議處置；若合適可附圖像說明（非必須）。',
    `文末請用獨立標題「${SUGGESTION_MARKER}」，其後每行一條可追問的問題。`,
    '',
    '```json',
    JSON.stringify(docs, null, 2),
    '```',
  ].join('\n');
}

/** Operator-facing hint for the Smart Logging analysis bar. */
export function analysisActionHint(opts: {
  loadedCount: number;
  selectedCount: number;
  canDiagnose: boolean;
}): string {
  if (!opts.canDiagnose) {
    return '目前角色為 Viewer，無法送出框選日誌分析。';
  }
  if (opts.loadedCount <= 0) {
    return `先讓串流載入日誌，再勾選列左側核取方塊（最多 ${BOUNDED_LOG_ANALYSIS_MAX} 筆），按「送出分析」。`;
  }
  if (opts.selectedCount <= 0) {
    return `勾選下方列左側核取方塊（最多 ${BOUNDED_LOG_ANALYSIS_MAX} 筆），再按「送出分析」。`;
  }
  return `已選 ${opts.selectedCount} / ${BOUNDED_LOG_ANALYSIS_MAX} 筆。按「送出分析」交給 Diagnosis Orchestrator。`;
}
