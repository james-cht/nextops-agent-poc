import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAlertDrilldownHref, isAlertActiveDuring } from './alert-active-window.ts';
import type { Alert } from './alert-manager.ts';

function alert(partial: Partial<Alert> & Pick<Alert, 'startsAt'>): Alert {
  return {
    id: 'x',
    fingerprint: 'x',
    status: 'firing',
    labels: {},
    annotations: {},
    endsAt: null,
    generatorURL: '',
    receivedAt: partial.startsAt,
    acknowledged: false,
    ...partial,
  };
}

describe('isAlertActiveDuring', () => {
  const hourStart = new Date('2026-06-29T02:00:00+08:00').getTime();
  const hourEnd = new Date('2026-06-29T02:59:59.999+08:00').getTime();

  it('includes alert that started before hour and is still firing', () => {
    const a = alert({ startsAt: '2026-06-29T00:00:00+08:00', endsAt: null });
    assert.equal(isAlertActiveDuring(a, hourStart, hourEnd), true);
  });

  it('excludes alert that ended before the hour', () => {
    const a = alert({
      startsAt: '2026-06-29T00:00:00+08:00',
      endsAt: '2026-06-29T01:30:00+08:00',
      status: 'resolved',
    });
    assert.equal(isAlertActiveDuring(a, hourStart, hourEnd), false);
  });

  it('includes alert that started during the hour', () => {
    const a = alert({ startsAt: '2026-06-29T02:15:00+08:00' });
    assert.equal(isAlertActiveDuring(a, hourStart, hourEnd), true);
  });
});

describe('buildAlertDrilldownHref', () => {
  it('emits the trend-chart drill-down under the Public Base Path', () => {
    const href = buildAlertDrilldownHref({
      publicBasePath: '/nextops',
      hourStart: new Date('2026-06-29T02:00:00Z'),
      hourEndMs: new Date('2026-06-29T03:00:00Z').getTime(),
      siteClusterTag: 'lh-k8s-cluster',
      severity: 'Critical',
    });
    assert.match(href, /^\/nextops\/alerts\?/);
    assert.match(href, /site=lh-k8s-cluster/);
    assert.match(href, /severity=critical/);
    assert.match(href, /status=firing/);
  });

  it('drops the prefix on host-root deploys (laptop / dedicated host)', () => {
    const href = buildAlertDrilldownHref({
      publicBasePath: '',
      hourStart: new Date('2026-06-29T02:00:00Z'),
      hourEndMs: new Date('2026-06-29T03:00:00Z').getTime(),
    });
    assert.match(href, /^\/alerts\?/);
  });
});
