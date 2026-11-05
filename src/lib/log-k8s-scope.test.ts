import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildLogK8sDocFilters,
  LOG_NAMESPACE_FIELD,
  LOG_POD_FIELD,
  normalizeLogK8sScope,
} from './log-k8s-scope.ts';

describe('normalizeLogK8sScope', () => {
  it('ignores namespace/pod in non_k8s mode', () => {
    const r = normalizeLogK8sScope({
      mode: 'non_k8s',
      namespace: 'mes',
      pod: 'api-1',
    });
    assert.deepEqual(r, { ok: true });
  });

  it('rejects pod without namespace', () => {
    const r = normalizeLogK8sScope({ mode: 'k8s', pod: 'api-1' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'POD_REQUIRES_NAMESPACE');
  });

  it('accepts namespace only or both', () => {
    assert.deepEqual(normalizeLogK8sScope({ mode: 'k8s', namespace: 'mes' }), {
      ok: true,
      namespace: 'mes',
    });
    assert.deepEqual(
      normalizeLogK8sScope({ mode: 'k8s', namespace: 'mes', pod: 'api-1' }),
      { ok: true, namespace: 'mes', pod: 'api-1' },
    );
  });
});

describe('buildLogK8sDocFilters', () => {
  it('builds term filters on fixed fields', () => {
    assert.deepEqual(buildLogK8sDocFilters({ namespace: 'mes', pod: 'api-1' }), [
      { term: { [LOG_NAMESPACE_FIELD]: 'mes' } },
      { term: { [LOG_POD_FIELD]: 'api-1' } },
    ]);
  });
});
