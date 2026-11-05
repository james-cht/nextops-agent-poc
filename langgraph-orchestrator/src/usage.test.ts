import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTraceUsage, extractRecordedUsage, truncateField } from './usage.ts';

describe('truncateField', () => {
  it('marks overflow', () => {
    const r = truncateField('abcdef', 4);
    assert.equal(r.value, 'abcd');
    assert.equal(r.truncated, true);
  });
});

describe('extractRecordedUsage', () => {
  it('reads OpenAI-shaped usage', () => {
    const raw = JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 4 } });
    assert.deepEqual(extractRecordedUsage(raw), { inputTokens: 10, outputTokens: 4 });
  });
});

describe('buildTraceUsage', () => {
  it('labels estimated when usage is absent', () => {
    const usage = buildTraceUsage({
      rawResponse: '{"choices":[{"message":{"content":"hi"}}]}',
      systemPrompt: 'sys',
      question: 'q',
      answer: 'hi',
      model: 'gemini-2.5-flash-lite',
      rates: { 'gemini-2.5-flash-lite': { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4 } },
    });
    assert.equal(usage.source, 'estimated');
    assert.ok(usage.inputTokens >= 1);
  });

  it('labels recorded when usage is present', () => {
    const usage = buildTraceUsage({
      rawResponse: JSON.stringify({
        choices: [{ message: { content: 'hi' } }],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }),
      systemPrompt: 'sys',
      question: 'q',
      answer: 'hi',
      model: 'gemini-2.5-flash-lite',
      rates: { 'gemini-2.5-flash-lite': { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4 } },
    });
    assert.equal(usage.source, 'recorded');
    assert.equal(usage.inputTokens, 100);
    assert.equal(usage.outputTokens, 20);
  });
});
