import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatOrchestratorFetchError } from './dify-upstream-error.ts';

describe('formatOrchestratorFetchError', () => {
  it('does not brand LangGraph fetch failures as Dify', () => {
    const msg = formatOrchestratorFetchError(
      'http://127.0.0.1:3200',
      new TypeError('fetch failed'),
    );
    assert.match(msg, /Cannot reach LangGraph orchestrator at http:\/\/127.0.0.1:3200/);
    assert.match(msg, /ORCH_BASE_URL/);
    assert.doesNotMatch(msg, /Dify/);
    assert.doesNotMatch(msg, /DIFY_/);
  });
});
