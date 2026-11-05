import assert from 'node:assert/strict';
import test from 'node:test';
import { computeLogHighlights } from './log-highlight.ts';

test('returns empty array for empty text', () => {
  const result = computeLogHighlights('');
  assert.deepEqual(result, []);
});

test('text containing error yields at least one span with kind lexicon', () => {
  const result = computeLogHighlights('An error occurred');
  const hasLexicon = result.some((span) => span.kind === 'lexicon');
  assert.strictEqual(hasLexicon, true);
});

test('keyword option timeout highlights that word with kind keyword', () => {
  const result = computeLogHighlights('connection timeout occurred', { keyword: 'timeout' });
  const keywordSpan = result.find((span) => span.kind === 'keyword');
  assert.ok(keywordSpan);
  assert.strictEqual(keywordSpan.kind, 'keyword');
});
