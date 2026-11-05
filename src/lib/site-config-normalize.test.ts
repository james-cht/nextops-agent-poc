import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeSiteConfig } from './site-config-normalize.ts';

describe('normalizeSiteConfig', () => {
  it('maps snake_case keys and defaults to GET (including query-api subpaths)', () => {
    const config = normalizeSiteConfig({
      query_url: 'https://unified-xops.corp.example.com/thanos-na/query-api',
      alerts_url: 'https://unified-xops.corp.example.com/thanos-na/alerts-api/api/v1/alerts',
      cluster_tag: 'na-k8s-cluster',
      factory_code: 'na',
      default_log_mode: 'k8s',
    });
    assert.equal(config.queryUrl, 'https://unified-xops.corp.example.com/thanos-na/query-api');
    assert.equal(config.alertsUrl, 'https://unified-xops.corp.example.com/thanos-na/alerts-api/api/v1/alerts');
    assert.equal(config.clusterTag, 'na-k8s-cluster');
    assert.equal(config.factoryCode, 'na');
    assert.equal(config.defaultLogMode, 'k8s');
    assert.equal(config.queryMethod, 'GET');
    assert.equal(config.robustaCoverage, false);
    assert.equal(config.robustaClusterKey, '');
  });

  it('keeps explicit queryMethod when provided', () => {
    const config = normalizeSiteConfig({
      queryUrl: 'http://192.0.2.5:20902',
      alertsUrl: 'http://192.0.2.5:30902/api/v1/alerts',
      clusterTag: 'lh-k8s-cluster',
      factoryCode: 'lh',
      defaultLogMode: 'k8s',
      queryMethod: 'GET',
    });

    assert.equal(config.queryMethod, 'GET');
    assert.equal(config.factoryCode, 'lh');
    assert.equal(config.robustaCoverage, false);
  });

  it('maps Robusta Coverage and Cluster Key', () => {
    const config = normalizeSiteConfig({
      queryUrl: 'http://prom',
      alertsUrl: 'http://am',
      clusterTag: 'lh-k8s-cluster',
      robusta_coverage: true,
      robusta_cluster_key: 'lh-k8s-cluster',
    });
    assert.equal(config.robustaCoverage, true);
    assert.equal(config.robustaClusterKey, 'lh-k8s-cluster');
  });
});
