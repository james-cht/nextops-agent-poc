/**
 * Log index resolution for Smart Logging and ES tools (ADR-0013).
 * Pure helpers — prefix/env wiring lives in server callers.
 */

export type LogMode = 'k8s' | 'non_k8s';

export const DEFAULT_LOG_INDEX_PREFIX = 'logs';
export const MAX_LOG_INDEX_PATTERN_LENGTH = 200;
export const LOG_INDEX_SAFE_PATTERN = /^[a-zA-Z0-9.*_-]+$/;
export const LOG_INDEX_SEGMENT_PATTERN = /^[a-zA-Z0-9._-]+$/;

export type ResolveLogIndexInput = {
  prefix?: string;
  factoryCode: string;
  mode: LogMode;
  /** Operator-supplied pattern; when set, no week expansion / no rewrite */
  index?: string | null;
  timeFrom?: string | null;
  timeTo?: string | null;
  /**
   * Expand yyyy.ww on server-built defaults only.
   * Default false: production indices use daily suffixes (e.g. logs-yt-k8s-es-log-2026.08.06),
   * so ISO-week expansion yields zero shards. Rely on `@timestamp` filters instead.
   */
  expandWeeks?: boolean;
};

export type ResolveLogIndexOk = { ok: true; index: string; assembled: boolean };
export type ResolveLogIndexErr = {
  ok: false;
  code: 'FACTORY_CODE_MISSING' | 'INVALID_INDEX' | 'INVALID_MODE';
  message: string;
};
export type ResolveLogIndexResult = ResolveLogIndexOk | ResolveLogIndexErr;

export function normalizeLogIndexPrefix(raw: string | undefined | null): string {
  const trimmed = (raw ?? DEFAULT_LOG_INDEX_PREFIX).trim();
  return trimmed || DEFAULT_LOG_INDEX_PREFIX;
}

export function normalizeLogMode(raw: string | undefined | null): LogMode | null {
  if (raw === 'k8s' || raw === 'non_k8s') return raw;
  return null;
}

export function siteLogPrefix(prefix: string, factoryCode: string): string {
  return `${normalizeLogIndexPrefix(prefix)}-${factoryCode}`;
}

export function defaultSiteLogPattern(prefix: string, factoryCode: string): string {
  return `${siteLogPrefix(prefix, factoryCode)}-*`;
}

/**
 * Assemble the default Site Log Index Pattern (no week expansion).
 * Log Namespace / Log Pod are document filters — they never rewrite this pattern (ADR-0013).
 */
export function assembleLogIndexPattern(input: {
  prefix?: string;
  factoryCode: string;
  mode: LogMode;
}): ResolveLogIndexResult {
  const factoryCode = input.factoryCode?.trim();
  if (!factoryCode) {
    return { ok: false, code: 'FACTORY_CODE_MISSING', message: 'Site Factory Code is required' };
  }
  if (!LOG_INDEX_SEGMENT_PATTERN.test(factoryCode)) {
    return { ok: false, code: 'INVALID_INDEX', message: 'Factory Code contains invalid characters' };
  }

  const prefix = normalizeLogIndexPrefix(input.prefix);
  const base = siteLogPrefix(prefix, factoryCode);

  if (input.mode !== 'k8s' && input.mode !== 'non_k8s') {
    return { ok: false, code: 'INVALID_MODE', message: 'mode must be k8s or non_k8s' };
  }

  return { ok: true, index: `${base}-*`, assembled: true };
}

export function validateLogIndexPattern(
  pattern: string,
  prefix: string,
  factoryCode: string,
): string | null {
  const trimmed = pattern.trim();
  if (!trimmed) return 'index pattern is required';
  if (trimmed.length > MAX_LOG_INDEX_PATTERN_LENGTH) {
    return `index pattern exceeds ${MAX_LOG_INDEX_PATTERN_LENGTH} characters`;
  }
  if (trimmed.includes(',') || /\s/.test(trimmed)) {
    return 'index pattern must be a single pattern without commas or whitespace';
  }
  if (trimmed.startsWith('_') || trimmed.includes('..')) {
    return 'index pattern contains forbidden sequences';
  }
  if (!LOG_INDEX_SAFE_PATTERN.test(trimmed)) {
    return 'index pattern contains invalid characters';
  }
  const required = siteLogPrefix(prefix, factoryCode);
  if (!trimmed.startsWith(required)) {
    return `index pattern must stay under ${required}`;
  }
  if (trimmed.length > required.length) {
    const next = trimmed[required.length];
    if (next !== '-' && next !== '*') {
      return `index pattern must stay under ${required}`;
    }
  }
  return null;
}

/** ISO week-year and week number (UTC date). */
export function getIsoWeekParts(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: isoYear, week };
}

export function formatIsoWeek(year: number, week: number): string {
  return `${year}.${String(week).padStart(2, '0')}`;
}

/** Inclusive list of yyyy.ww keys covering [timeFrom, timeTo]. */
export function listIsoWeeksInRange(timeFrom: string, timeTo: string): string[] {
  const from = new Date(timeFrom);
  const to = new Date(timeTo);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return [];

  const weeks: string[] = [];
  const seen = new Set<string>();
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));

  // Cap expansion to avoid huge fan-out (≈2 years)
  let guard = 0;
  while (cursor <= end && guard < 110) {
    const { year, week } = getIsoWeekParts(cursor);
    const key = formatIsoWeek(year, week);
    if (!seen.has(key)) {
      seen.add(key);
      weeks.push(key);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return weeks;
}

/**
 * Apply week suffixes to an assembled base pattern ending in `-*`.
 * non_k8s: `logs-lh-*` → `logs-lh-2026.32`
 * k8s: `logs-lh-*` / `logs-lh-ns-*` → `logs-lh-*-2026.32` / `logs-lh-ns-*-2026.32`
 */
export function applyWeekExpansion(
  assembledPattern: string,
  mode: LogMode,
  weeks: string[],
): string {
  if (weeks.length === 0 || !assembledPattern.endsWith('-*')) return assembledPattern;

  if (mode === 'non_k8s') {
    const base = assembledPattern.slice(0, -2); // drop "-*"
    return weeks.map((w) => `${base}-${w}`).join(',');
  }

  // logs-lh-* → logs-lh-*-{week}
  const stem = assembledPattern.slice(0, -1); // "logs-lh-"
  return weeks.map((w) => `${stem}*-${w}`).join(',');
}

export function resolveLogIndex(input: ResolveLogIndexInput): ResolveLogIndexResult {
  const prefix = normalizeLogIndexPrefix(input.prefix);
  const factoryCode = input.factoryCode?.trim();
  if (!factoryCode) {
    return { ok: false, code: 'FACTORY_CODE_MISSING', message: 'Site Factory Code is required' };
  }

  const custom = input.index?.trim();
  if (custom) {
    const err = validateLogIndexPattern(custom, prefix, factoryCode);
    if (err) return { ok: false, code: 'INVALID_INDEX', message: err };
    return { ok: true, index: custom, assembled: false };
  }

  const mode = normalizeLogMode(input.mode);
  if (!mode) {
    return { ok: false, code: 'INVALID_MODE', message: 'mode must be k8s or non_k8s' };
  }

  const assembled = assembleLogIndexPattern({
    prefix,
    factoryCode,
    mode,
  });
  if (!assembled.ok) return assembled;

  const expand = input.expandWeeks === true;
  if (
    expand &&
    input.timeFrom &&
    input.timeTo &&
    assembled.index.endsWith('-*')
  ) {
    const weeks = listIsoWeeksInRange(input.timeFrom, input.timeTo);
    if (weeks.length > 0) {
      return {
        ok: true,
        index: applyWeekExpansion(assembled.index, mode, weeks),
        assembled: true,
      };
    }
  }

  return assembled;
}

export function buildLogEsIndices(factoryCode: string, prefix?: string) {
  const pattern = defaultSiteLogPattern(prefix ?? DEFAULT_LOG_INDEX_PREFIX, factoryCode);
  const fields = ['@timestamp', 'level', 'message', 'host'];
  return [
    {
      pattern,
      description: `K8s logs for this Site. Default query pattern is logs-{factoryCode}-*. Narrow with Log Namespace / Log Pod document filters (kubernetes.namespace_name / kubernetes.pod_name), not index segments.`,
      fields: [...fields, 'kubernetes.namespace_name', 'kubernetes.pod_name'],
      hostType: 'k8s' as const,
    },
    {
      pattern,
      description: `Non-K8s logs for this Site. Default query pattern is logs-{factoryCode}-* (env equals factoryCode).`,
      fields: [...fields],
      hostType: ['baremetal', 'vm'] as string[],
    },
  ];
}

/** Closed-select label for long Watchlist patterns; keep the full value for queries. */
export function shortIndexPattern(pattern: string, max = 36): string {
  const trimmed = pattern.trim();
  if (trimmed.length <= max) return trimmed;
  return `…${trimmed.slice(-(max - 1))}`;
}
