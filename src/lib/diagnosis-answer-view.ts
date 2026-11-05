/** Diagnosis Answer chrome (ADR-0020). Presentation split + blocks — not a findings schema. */

export const APPENDIX_MARKER = '詳細資料';

export const CALLOUT_KINDS = ['重點', '提示', '風險', '建議'] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

export type AnswerInline = { text: string; bold: boolean };

export type AnswerBlock =
  | { type: 'heading'; text: string }
  | { type: 'callout'; kind: CalloutKind; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; text: string }
  | { type: 'paragraph'; text: string };

const CALLOUT_RE =
  /^(?:[-*]\s+|>\s+)?(?:\*{0,2})(重點|提示|風險|建議)(?:\*{0,2})[：:]\s*(.*)$/;

export function headingLabel(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\*{1,2}(.+?)\*{1,2}$/, '$1')
    .trim();
}

export function splitDiagnosisAnswer(raw: string): { summary: string; appendix: string | null } {
  const text = raw.replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const idx = lines.findIndex((line) => headingLabel(line) === APPENDIX_MARKER);
  if (idx === -1) return { summary: text.trim(), appendix: null };
  return {
    summary: lines.slice(0, idx).join('\n').trim(),
    appendix: lines.slice(idx + 1).join('\n').trim(),
  };
}

export function parseInline(text: string): AnswerInline[] {
  const parts: AnswerInline[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), bold: false });
    parts.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts.length ? parts : [{ text, bold: false }];
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && t.includes('|', 1);
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

function splitCells(line: string): string[] {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return t.split('|').map((c) => c.trim());
}

function matchCallout(line: string): { kind: CalloutKind; text: string } | null {
  const m = line.trim().match(CALLOUT_RE);
  if (!m) return null;
  return { kind: m[1] as CalloutKind, text: m[2].trim() };
}

function isAtxHeading(line: string): boolean {
  return /^#{1,6}\s+\S/.test(line.trim());
}

function isBoldHeadingLine(line: string): boolean {
  const t = line.trim();
  return /^\*{2}[^*]+\*{2}$/.test(t) && headingLabel(t) !== APPENDIX_MARKER;
}

function readTable(lines: string[], start: number): { block: AnswerBlock; next: number } {
  const headers = splitCells(lines[start]);
  let i = start + 1;
  if (i < lines.length && isTableSeparator(lines[i])) i += 1;
  const rows: string[][] = [];
  while (i < lines.length && isTableRow(lines[i]) && !isTableSeparator(lines[i])) {
    rows.push(splitCells(lines[i]));
    i += 1;
  }
  return { block: { type: 'table', headers, rows }, next: i };
}

function readList(lines: string[], start: number): { block: AnswerBlock; next: number } {
  const ordered = /^\d+\.\s+/.test(lines[start].trim());
  const items: string[] = [];
  let i = start;
  while (i < lines.length) {
    const t = lines[i].trim();
    const m = ordered ? t.match(/^\d+\.\s+(.*)$/) : t.match(/^[-*]\s+(.*)$/);
    if (!m) break;
    if (matchCallout(t)) break;
    items.push(m[1]);
    i += 1;
  }
  return { block: { type: 'list', ordered, items }, next: i };
}

function readFence(lines: string[], start: number): { block: AnswerBlock; next: number } {
  const chunks: string[] = [];
  let i = start + 1;
  while (i < lines.length && !lines[i].trim().startsWith('```')) {
    chunks.push(lines[i]);
    i += 1;
  }
  if (i < lines.length) i += 1;
  return { block: { type: 'code', text: chunks.join('\n') }, next: i };
}

function readParagraph(lines: string[], start: number): { block: AnswerBlock; next: number } {
  const chunks: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) break;
    if (isAtxHeading(line) || isBoldHeadingLine(line)) break;
    if (matchCallout(line)) break;
    if (isTableRow(line)) break;
    if (line.trim().startsWith('```')) break;
    if (/^[-*]\s+/.test(line.trim()) || /^\d+\.\s+/.test(line.trim())) break;
    chunks.push(line.trim());
    i += 1;
  }
  return { block: { type: 'paragraph', text: chunks.join(' ') }, next: i };
}

export function parseAnswerBlocks(raw: string): AnswerBlock[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const blocks: AnswerBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.trim().startsWith('```')) {
      const fence = readFence(lines, i);
      blocks.push(fence.block);
      i = fence.next;
      continue;
    }
    if (isTableRow(line)) {
      const table = readTable(lines, i);
      blocks.push(table.block);
      i = table.next;
      continue;
    }
    if (isAtxHeading(line) || isBoldHeadingLine(line)) {
      const label = headingLabel(line);
      if (label !== APPENDIX_MARKER) blocks.push({ type: 'heading', text: label });
      i += 1;
      continue;
    }
    const callout = matchCallout(line);
    if (callout) {
      blocks.push({ type: 'callout', kind: callout.kind, text: callout.text });
      i += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line.trim()) || /^\d+\.\s+/.test(line.trim())) {
      const list = readList(lines, i);
      blocks.push(list.block);
      i = list.next;
      continue;
    }
    const para = readParagraph(lines, i);
    blocks.push(para.block);
    i = para.next;
  }
  return blocks;
}
