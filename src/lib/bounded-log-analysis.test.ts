import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOUNDED_LOG_ANALYSIS_MAX,
  BOUNDED_LOG_MESSAGE_MAX,
  SUGGESTION_MARKER,
  analysisActionHint,
  buildBoundedLogAnalysisPrompt,
  projectCompactLogDocument,
  splitSuggestionMarker,
  toggleLogSelection,
  clearLogSelection,
  selectFirstLogIds,
} from './bounded-log-analysis.ts';

describe('Bounded Log Analysis selection', () => {
  it('allows selecting up to the hard cap of 20 ids', () => {
    let selected: string[] = [];
    for (let i = 0; i < BOUNDED_LOG_ANALYSIS_MAX; i++) {
      const r = toggleLogSelection(selected, `id-${i}`);
      assert.equal(r.ok, true);
      if (r.ok) selected = r.selected;
    }
    assert.equal(selected.length, 20);
  });

  it('blocks selecting an additional id when already at the cap', () => {
    const selected = Array.from({ length: 20 }, (_, i) => `id-${i}`);
    const r = toggleLogSelection(selected, 'id-extra');
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, 'CAP_EXCEEDED');
      assert.equal(r.selected.length, 20);
    }
  });

  it('deselects an already selected id without counting against the cap', () => {
    const selected = ['a', 'b'];
    const r = toggleLogSelection(selected, 'a');
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.selected, ['b']);
  });

  it('selectFirstLogIds takes the first N and reports truncation', () => {
    const ids = Array.from({ length: 25 }, (_, i) => `id-${i}`);
    const r = selectFirstLogIds(ids);
    assert.equal(r.selected.length, 20);
    assert.equal(r.truncated, true);
    assert.deepEqual(r.selected.slice(0, 3), ['id-0', 'id-1', 'id-2']);
  });

  it('clearLogSelection empties the set', () => {
    assert.deepEqual(clearLogSelection().selected, []);
  });
});

describe('projectCompactLogDocument', () => {
  it('keeps allowlisted paths and drops unrelated _source noise', () => {
    const compact = projectCompactLogDocument({
      '@timestamp': '2026-08-27T01:00:00.000Z',
      message: 'HikariPool-1 - Connection is not available',
      kubernetes: { namespace: 'prod', pod_name: 'api-1', labels: { app: 'api' } },
      http: { response: { status_code: 500 }, request: { method: 'GET' } },
      error: { type: 'SQLException', message: 'timeout' },
      hugeBlob: { nested: 'should-not-appear' },
      agent: { ephemeral_id: 'nope' },
    });
    assert.equal(compact['@timestamp'], '2026-08-27T01:00:00.000Z');
    assert.equal(compact.message, 'HikariPool-1 - Connection is not available');
    assert.deepEqual(compact.kubernetes, {
      namespace: 'prod',
      pod_name: 'api-1',
      labels: { app: 'api' },
    });
    assert.equal((compact.http as { response: { status_code: number } }).response.status_code, 500);
    assert.equal((compact.error as { type: string }).type, 'SQLException');
    assert.equal('hugeBlob' in compact, false);
    assert.equal('agent' in compact, false);
  });

  it(`truncates message fields to ${BOUNDED_LOG_MESSAGE_MAX} chars with an ellipsis`, () => {
    const long = 'x'.repeat(BOUNDED_LOG_MESSAGE_MAX + 50);
    const compact = projectCompactLogDocument({ message: long });
    assert.equal(typeof compact.message, 'string');
    assert.equal((compact.message as string).length, BOUNDED_LOG_MESSAGE_MAX + 1);
    assert.ok((compact.message as string).endsWith('…'));
  });

  it('prefers message over message_log over string log', () => {
    assert.equal(
      projectCompactLogDocument({ message: 'a', message_log: 'b', log: 'c' }).message,
      'a',
    );
    assert.equal(projectCompactLogDocument({ message_log: 'b', log: 'c' }).message, 'b');
    assert.equal(projectCompactLogDocument({ log: 'c' }).message, 'c');
  });
});

describe('splitSuggestionMarker', () => {
  it('splits answer body from one-question-per-line suggestions', () => {
    const raw = [
      '連線池耗盡，排程失敗。',
      '',
      `## ${SUGGESTION_MARKER}`,
      'DB 連線是否被防火牆擋住？',
      '- 最近是否調整過 pool size？',
      '1. 同時間是否有大量 5xx？',
    ].join('\n');
    const split = splitSuggestionMarker(raw);
    assert.equal(split.answer, '連線池耗盡，排程失敗。');
    assert.deepEqual(split.suggestions, [
      'DB 連線是否被防火牆擋住？',
      '最近是否調整過 pool size？',
      '同時間是否有大量 5xx？',
    ]);
  });

  it('returns empty suggestions when the marker is absent', () => {
    const split = splitSuggestionMarker('只有摘要');
    assert.equal(split.answer, '只有摘要');
    assert.deepEqual(split.suggestions, []);
  });
});

describe('buildBoundedLogAnalysisPrompt', () => {
  it('embeds compact JSON and asks for Suggestion Marker follow-ups', () => {
    const prompt = buildBoundedLogAnalysisPrompt(
      [{ '@timestamp': 't', message: 'err' }],
      'SHSDGX',
    );
    assert.match(prompt, /SHSDGX/);
    assert.match(prompt, /建議提問/);
    assert.match(prompt, /"message": "err"/);
  });
});

describe('analysisActionHint', () => {
  it('tells the operator to tick row checkboxes when logs are loaded but none selected', () => {
    const hint = analysisActionHint({ loadedCount: 12, selectedCount: 0, canDiagnose: true });
    assert.match(hint, /核取方塊/);
    assert.match(hint, /送出分析/);
  });

  it('blocks Viewer with a role message', () => {
    const hint = analysisActionHint({ loadedCount: 12, selectedCount: 3, canDiagnose: false });
    assert.match(hint, /Viewer/);
  });
});
