import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { openTraceStore, TRACE_RETENTION_MS, type DiagnosisTrace } from './traces.ts';

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function sample(overrides: Partial<DiagnosisTrace> = {}): DiagnosisTrace {
  return {
    id: 't1',
    conversationId: 'c1',
    siteId: 'lh',
    operatorUsername: 'ops',
    query: '龍華 CPU',
    error: '',
    answer: '偏高',
    model: 'gemini-2.5-flash-lite',
    usage: { inputTokens: 10, outputTokens: 4, usd: 0.000001, source: 'estimated' },
    observations: [
      {
        kind: 'tool_endpoint',
        name: 'get_site_resource_health',
        truncated: false,
        payload: { path: '/api/sites/lh/resource-health', body: '{}' },
        startedAt: '2026-08-01T00:00:00.000Z',
        endedAt: '2026-08-01T00:00:01.000Z',
        status: 200,
      },
    ],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('TraceStore', () => {
  it('round-trips a Diagnosis Trace', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-traces-'));
    dirs.push(d);
    const store = openTraceStore(path.join(d, 'traces.sqlite'));
    store.put(sample());
    const got = store.get('t1');
    assert.equal(got?.operatorUsername, 'ops');
    assert.equal(got?.observations[0]?.kind, 'tool_endpoint');
    assert.equal(store.list()[0]?.observationCount, 1);
    store.close();
  });

  it('prunes traces older than 30 days', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-traces-'));
    dirs.push(d);
    const store = openTraceStore(path.join(d, 'traces.sqlite'));
    const old = new Date(Date.now() - TRACE_RETENTION_MS - 1000).toISOString();
    store.put(sample({ id: 'old', createdAt: old }));
    store.put(sample({ id: 'new' }));
    store.prune();
    assert.equal(store.get('old'), null);
    assert.ok(store.get('new'));
    store.close();
  });
});
