/**
 * Deterministic Log Highlight spans (ADR-0021) — no LLM.
 */

export type HighlightSpan = {
  start: number;
  end: number;
  kind: 'keyword' | 'category' | 'lexicon';
};

const ATTENTION_LEXICON =
  /\b(error|exception|fatal|panic|oom|timeout|timed\s*out|refused|critical)\b/gi;

function mergeSpans(spans: HighlightSpan[]): HighlightSpan[] {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: HighlightSpan[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start < last.end) {
      if (s.end > last.end) last.end = s.end;
      continue;
    }
    out.push({ ...s });
  }
  return out;
}

function pushMatches(
  text: string,
  re: RegExp,
  kind: HighlightSpan['kind'],
  into: HighlightSpan[],
): void {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const copy = new RegExp(re.source, flags);
  let m: RegExpExecArray | null;
  while ((m = copy.exec(text)) !== null) {
    if (m[0].length === 0) {
      copy.lastIndex += 1;
      continue;
    }
    into.push({ start: m.index, end: m.index + m[0].length, kind });
  }
}

export function computeLogHighlights(
  text: string,
  opts: {
    keyword?: string;
    categoryPatterns?: string[];
  } = {},
): HighlightSpan[] {
  if (!text) return [];
  const spans: HighlightSpan[] = [];

  const kw = opts.keyword?.trim();
  if (kw && kw !== '*') {
    try {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pushMatches(text, new RegExp(escaped, 'gi'), 'keyword', spans);
    } catch {
      /* ignore */
    }
  }

  for (const pat of opts.categoryPatterns ?? []) {
    if (!pat.trim()) continue;
    try {
      pushMatches(text, new RegExp(pat, 'gi'), 'category', spans);
    } catch {
      /* ignore bad regex */
    }
  }

  pushMatches(text, ATTENTION_LEXICON, 'lexicon', spans);
  return mergeSpans(spans);
}

/** Split text into segments for rendering. */
export function applyHighlightSegments(
  text: string,
  spans: HighlightSpan[],
): { text: string; kind: HighlightSpan['kind'] | null }[] {
  if (!spans.length) return [{ text, kind: null }];
  const merged = mergeSpans(spans);
  const parts: { text: string; kind: HighlightSpan['kind'] | null }[] = [];
  let cursor = 0;
  for (const s of merged) {
    if (s.start > cursor) {
      parts.push({ text: text.slice(cursor, s.start), kind: null });
    }
    parts.push({ text: text.slice(s.start, s.end), kind: s.kind });
    cursor = s.end;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), kind: null });
  }
  return parts;
}
