import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveNoProxy } from './proxy-no-proxy.ts';
import { isProductionProxyMisconfiguration } from './proxy-policy.ts';

const sampleSiteConfigs = {
  'FSJ(華雷斯)': {
    queryUrl: 'https://unified-xops.corp.example.com/thanos-na/query-api',
    alertsUrl: 'https://unified-xops.corp.example.com/thanos-na/alerts-api/api/v1/alerts',
  },
  龍華: {
    queryUrl: 'http://192.0.2.5:20902',
    alertsUrl: 'http://192.0.2.5:30902/api/v1/alerts',
  },
};

describe('resolveNoProxy', () => {
  it('includes loopback hosts and all configured upstream hostnames by default', () => {
    const noProxy = resolveNoProxy(sampleSiteConfigs);

    assert.match(noProxy, /localhost/);
    assert.match(noProxy, /unified-xops\.corp\.example\.com/);
    assert.match(noProxy, /10\.157\.181\.158/);
  });

  it('always bypasses in-cluster Diagnosis Orchestrator DNS names', () => {
    const noProxy = resolveNoProxy(sampleSiteConfigs, { bypassSiteHosts: false });
    assert.match(noProxy, /langgraph-orchestrator/);
    assert.match(noProxy, /nextops-orchestrator/);
    assert.doesNotMatch(noProxy, /unified-xops\.corp\.example\.com/);
  });

  it('includes ORCH_BASE_URL host via extraUrls', () => {
    const noProxy = resolveNoProxy(sampleSiteConfigs, {
      extraUrls: ['http://langgraph-orchestrator:3200'],
    });
    assert.match(noProxy, /langgraph-orchestrator/);
  });

  it('keeps only loopback hosts when bypassSiteHosts is false (laptop proxy dev)', () => {
    const noProxy = resolveNoProxy(sampleSiteConfigs, { bypassSiteHosts: false });

    assert.match(noProxy, /localhost/);
    assert.match(noProxy, /127\.0\.0\.1/);
    assert.doesNotMatch(noProxy, /unified-xops\.corp\.example\.com/);
    assert.doesNotMatch(noProxy, /10\.157\.181\.158/);
  });

  it('includes ES_BASE_URL host via extraUrls (Direct Upstream for Smart Logging)', () => {
    const noProxy = resolveNoProxy(sampleSiteConfigs, {
      bypassSiteHosts: true,
      extraUrls: ['http://192.0.2.18:39200', undefined, ''],
    });

    assert.match(noProxy, /10\.157\.181\.151/);
    assert.match(noProxy, /10\.157\.181\.158/);
  });
});

describe('isProductionProxyMisconfiguration', () => {
  it('flags production + proxy enabled', () => {
    assert.equal(isProductionProxyMisconfiguration('production', true), true);
  });

  it('allows production with proxy disabled', () => {
    assert.equal(isProductionProxyMisconfiguration('production', false), false);
  });

  it('allows development with proxy enabled', () => {
    assert.equal(isProductionProxyMisconfiguration('development', true), false);
  });
});
