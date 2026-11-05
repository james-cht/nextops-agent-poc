import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TrackingEvent } from './system-behavior-tracking.ts';
import { computeSystemStatusSignals } from './system-status-signal.ts';

const runtime = {
  serviceName: 'nextops',
  instanceId: 'inst-1',
  containerId: 'cont-1',
  hostname: 'host-1',
  pid: 1,
};

function dependencyEvent(
  dependency: string,
  status: 'success' | 'failure',
  durationMs: number,
  ts: string,
): TrackingEvent {
  return {
    schemaVersion: '1.0',
    ts,
    severity: status === 'success' ? 'info' : 'error',
    status,
    eventType: 'dependency_request',
    requestId: `req-${dependency}-${durationMs}`,
    route: '/_search',
    dependency,
    durationMs,
    runtime,
  };
}

describe('computeSystemStatusSignals', () => {
  const now = Date.parse('2026-07-09T10:00:00.000Z');

  it('marks dependency healthy when success and latency are within thresholds', () => {
    const events = Array.from({ length: 100 }, (_, index) =>
      dependencyEvent(
        'Elasticsearch',
        'success',
        200 + (index % 5),
        '2026-07-09T09:58:00.000Z',
      ),
    );

    const snapshot = computeSystemStatusSignals(events, 5 * 60 * 1000, now);
    assert.equal(snapshot.dependencies[0]?.level, 'healthy');
    assert.equal(snapshot.overallLevel, 'healthy');
  });

  it('marks dependency critical when success rate drops below 95%', () => {
    const events = [
      ...Array.from({ length: 90 }, () =>
        dependencyEvent('Prometheus', 'success', 120, '2026-07-09T09:59:00.000Z'),
      ),
      ...Array.from({ length: 10 }, () =>
        dependencyEvent('Prometheus', 'failure', 4500, '2026-07-09T09:59:30.000Z'),
      ),
    ];

    const snapshot = computeSystemStatusSignals(events, 5 * 60 * 1000, now);
    assert.equal(snapshot.dependencies[0]?.level, 'critical');
    assert.equal(snapshot.overallLevel, 'critical');
  });
});
