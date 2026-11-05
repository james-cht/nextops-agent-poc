import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EMPTY_PROM_RESULT_MESSAGE,
  mapGlobalMetrics,
  presentKpi,
  type PrometheusInstantResponse,
} from './global-metrics.ts';

const healthOk: PrometheusInstantResponse = {
  status: 'success',
  data: { result: [{ value: [0, '0.01'] }] },
};

const latencyOk: PrometheusInstantResponse = {
  status: 'success',
  data: { result: [{ value: [0, '0.423'] }] },
};

const empty: PrometheusInstantResponse = {
  status: 'success',
  data: { result: [] },
};

describe('mapGlobalMetrics', () => {
  it('converts latency seconds to milliseconds when the series exists', () => {
    const mapped = mapGlobalMetrics({ health: { data: healthOk }, latency: { data: latencyOk } });
    assert.equal(mapped.healthScore, 99);
    assert.equal(mapped.avgLatency, 423);
    assert.equal(mapped.avgLatencyError, undefined);
  });

  it('reports empty latency series as missing data, not as a successful blank KPI', () => {
    const mapped = mapGlobalMetrics({ health: { data: healthOk }, latency: { data: empty } });
    assert.equal(mapped.healthScore, 99);
    assert.equal(mapped.avgLatency, null);
    assert.equal(mapped.avgLatencyError, EMPTY_PROM_RESULT_MESSAGE);
  });

  it('keeps health visible when the latency query fails independently', () => {
    const mapped = mapGlobalMetrics({
      health: { data: healthOk },
      latency: { fetchError: 'The operation was aborted due to timeout' },
    });
    assert.equal(mapped.healthScore, 99);
    assert.equal(mapped.avgLatency, null);
    assert.match(mapped.avgLatencyError ?? '', /timeout/i);
    assert.equal(mapped.healthScoreError, undefined);
  });

  it('surfaces Prometheus JSON status=error on the latency KPI only', () => {
    const mapped = mapGlobalMetrics({
      health: { data: healthOk },
      latency: { data: { status: 'error', error: 'query timed out' } },
    });
    assert.equal(mapped.healthScore, 99);
    assert.equal(mapped.avgLatency, null);
    assert.equal(mapped.avgLatencyError, 'query timed out');
  });

  it('does not invent a latency error when only health was requested', () => {
    const mapped = mapGlobalMetrics({ health: { data: healthOk } });
    assert.equal(mapped.healthScore, 99);
    assert.equal(mapped.avgLatency, null);
    assert.equal(mapped.avgLatencyError, undefined);
  });
});

describe('presentKpi', () => {
  it('shows a spinner only while the query has not settled', () => {
    const ui = presentKpi(null, null, false);
    assert.equal(ui.value, '---');
    assert.equal(ui.loading, true);
    assert.equal(ui.error, undefined);
  });

  it('does not keep spinning after an empty latency result settles (dashboard symptom)', () => {
    const mapped = mapGlobalMetrics({ health: { data: healthOk }, latency: { data: empty } });
    const ui = presentKpi(mapped.avgLatency, mapped.avgLatencyError, true);
    assert.equal(ui.loading, false);
    assert.ok(ui.error);
    assert.equal(ui.error, EMPTY_PROM_RESULT_MESSAGE);
  });
});
