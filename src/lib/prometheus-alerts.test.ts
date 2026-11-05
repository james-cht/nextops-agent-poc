import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizePrometheusAlert, findSiteIdByClusterTag } from './prometheus-alerts.ts';

describe('normalizePrometheusAlert', () => {
  it('maps firing Prometheus alert for matching cluster', () => {
    const alert = normalizePrometheusAlert(
      {
        labels: {
          alertname: 'HighMemory',
          severity: 'warning',
          cluster: 'lh-k8s-cluster',
        },
        annotations: { summary: 'Memory > 85%' },
        state: 'firing',
        activeAt: '2026-06-29T02:00:00.000Z',
      },
      'lh-k8s-cluster',
    );

    assert.ok(alert);
    assert.equal(alert!.status, 'firing');
    assert.equal(alert!.labels.alertname, 'HighMemory');
    assert.equal(alert!.acknowledged, false);
  });

  it('skips alerts for other clusters', () => {
    const alert = normalizePrometheusAlert(
      {
        labels: { cluster: 'na-k8s-cluster' },
        state: 'firing',
        activeAt: '2026-06-29T02:00:00.000Z',
      },
      'lh-k8s-cluster',
    );
    assert.equal(alert, null);
  });

  it('skips pending alerts (not counted on site detail)', () => {
    const alert = normalizePrometheusAlert(
      {
        labels: { cluster: 'lh-k8s-cluster' },
        state: 'pending',
        activeAt: '2026-06-29T02:00:00.000Z',
      },
      'lh-k8s-cluster',
    );
    assert.equal(alert, null);
  });
});

describe('findSiteIdByClusterTag', () => {
  it('resolves lh-k8s-cluster to 龍華', () => {
    assert.equal(findSiteIdByClusterTag('lh-k8s-cluster'), '龍華');
  });
});
