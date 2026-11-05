import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PROMETHEUS_FETCH_TIMEOUT_MS,
  buildMetricsRequest,
  explainMetricsFetchFailure,
  formatPrometheusFetchError,
  type QueryMethod,
} from './prometheus-query.ts';

describe('buildMetricsRequest', () => {
  it('uses GET /api/v1/query for standard Prometheus endpoints', () => {
    const { url, init } = buildMetricsRequest('http://192.0.2.5:20902', 'up');
    assert.equal(url, 'http://192.0.2.5:20902/api/v1/query?query=up');
    assert.equal(init.method, undefined);
    assert.equal(init.signal instanceof AbortSignal, true);
    assert.equal(PROMETHEUS_FETCH_TIMEOUT_MS, 30_000);
  });

  it('uses GET /api/v1/query for NA Thanos nginx subpath (matches rpt-backend)', () => {
    const naUrl = 'https://unified-xops.corp.example.com/thanos-na/query-api';
    const { url, init } = buildMetricsRequest(naUrl, 'up');
    assert.equal(url, 'https://unified-xops.corp.example.com/thanos-na/query-api/api/v1/query?query=up');
    assert.equal(init.method, undefined);
  });

  it('appends /api/v1/query when using explicit POST mode', () => {
    const { url, init } = buildMetricsRequest(
      'https://unified-xops.corp.example.com/thanos-na/query-api/',
      'count(up)',
      'POST',
    );
    assert.equal(url, 'https://unified-xops.corp.example.com/thanos-na/query-api/api/v1/query');
    assert.equal(init.method, 'POST');
    assert.equal(
      (init.headers as Record<string, string>)['Content-Type'],
      'application/x-www-form-urlencoded',
    );
    assert.equal(init.body, 'query=count%28up%29');
  });
});

describe('formatPrometheusFetchError', () => {
  it('explains proxy CONNECT 503 for NA ZTNA hosts', () => {
    const msg = formatPrometheusFetchError(
      Object.assign(new TypeError('fetch failed'), {
        cause: new Error('Tunnel connection failed: 503 Service Unavailable'),
      }),
      'https://unified-xops.corp.example.com/thanos-na/query-api/api/v1/query?query=up',
    );
    assert.match(msg, /HTTPS CONNECT/);
    assert.match(msg, /Akamai ZTNA/);
  });

  it('explains direct connect timeout to ZTNA address space', () => {
    const msg = formatPrometheusFetchError(
      Object.assign(new TypeError('fetch failed'), {
        cause: new Error('connect ETIMEDOUT 100.72.0.22:443'),
      }),
      'https://unified-xops.corp.example.com/thanos-na/query-api/api/v1/query?query=up',
    );
    assert.match(msg, /Akamai ZTNA/);
  });

  it('explains internal HTTP Prometheus timeout with no_proxy guidance', () => {
    const msg = formatPrometheusFetchError(
      Object.assign(new Error('The operation was aborted due to timeout'), {
        cause: undefined,
      }),
      'http://192.0.2.5:20902/api/v1/query?query=up',
    );
    assert.match(msg, /internal Prometheus/i);
    assert.match(msg, /no_proxy/i);
    assert.doesNotMatch(msg, /NA Thanos/i);
  });

  it('explains internal HTTP timeout without no_proxy when proxy is disabled', () => {
    const msg = formatPrometheusFetchError(
      Object.assign(new Error('The operation was aborted due to timeout'), {
        cause: undefined,
      }),
      'http://192.0.2.5:20902/api/v1/query?query=up',
      'GET',
      { proxyEnabled: false },
    );
    assert.match(msg, /proxy is disabled/i);
    assert.doesNotMatch(msg, /no_proxy/i);
  });
});

describe('NA overview fetch contract', () => {
  it('explainMetricsFetchFailure reports HTTP status from upstream', async () => {
    const mockFetch = async () =>
      ({
        ok: false,
        status: 405,
        statusText: 'Method Not Allowed',
        text: async () => 'GET not supported',
      }) as Response;

    const detail = await explainMetricsFetchFailure(
      'https://unified-xops.corp.example.com/thanos-na/query-api',
      'up',
      mockFetch,
      'POST',
    );
    assert.match(detail, /HTTP 405/);
    assert.match(detail, /GET not supported/);
  });

  it('alerts-api response shape uses data.Alerts', async () => {
    const alertsUrl = 'https://unified-xops.corp.example.com/thanos-na/alerts-api/api/v1/alerts';
    const mockFetch = async () =>
      ({
        ok: true,
        json: async () => ({
          data: { Alerts: [{ labels: { cluster: 'na-k8s-cluster' }, state: 'firing' }] },
        }),
      }) as Response;

    const res = await mockFetch(alertsUrl);
    const json = await res.json();
    const alerts = json.data?.Alerts ?? [];
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].state, 'firing');
  });
});
