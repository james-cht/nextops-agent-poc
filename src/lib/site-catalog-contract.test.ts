import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildEmptySiteResourceHealth,
  buildSiteDiagnosisContext,
  clampResourceHealthTopN,
  finalizeResourceHealthPartial,
  listSiteCatalogFromConfigs,
  rankTopOffenders,
  RESOURCE_HEALTH_DEFAULT_TOP_N,
  RESOURCE_HEALTH_HOST_TYPES,
  unavailableSection,
  type SiteCatalogEntry,
  type SiteResourceHealth,
} from './site-catalog-contract.ts';

describe('listSiteCatalogFromConfigs', () => {
  it('uses siteId as stable primary key and title', () => {
    const catalog = listSiteCatalogFromConfigs({
      重慶: {
        queryUrl: 'http://prom-1:9090',
        alertsUrl: 'http://prom-1:9093/api/v1/alerts',
        clusterTag: 'cq-k8s-cluster',
        factoryCode: 'cq',
        defaultLogMode: 'k8s',
        robustaCoverage: false,
        robustaClusterKey: '',
      },
      龍華: {
        queryUrl: 'http://prom-2:9090',
        alertsUrl: 'http://prom-2:9093/api/v1/alerts',
        clusterTag: 'lh-k8s-cluster',
        factoryCode: 'lh',
        defaultLogMode: 'k8s',
        robustaCoverage: true,
        robustaClusterKey: 'lh-k8s-cluster',
      },
    });

    assert.equal(catalog.length, 2);
    const lh = catalog.find((s) => s.siteId === '龍華');
    assert.ok(lh);
    assert.equal(lh.factoryCode, 'lh');
    assert.equal(lh.loggingAvailable, true);
    assert.equal(lh.clusterTag, 'lh-k8s-cluster');
    assert.equal(lh.robustaCoverage, true);
    assert.equal(lh.robustaClusterKey, 'lh-k8s-cluster');
    assert.equal(lh.robustaAvailable, true);
    const cq = catalog.find((s) => s.siteId === '重慶');
    assert.ok(cq);
    assert.equal(cq.robustaAvailable, false);
  });
});

describe('buildSiteDiagnosisContext', () => {
  it('returns Factory Code log indices for Smart Logging + AI Diagnosis', () => {
    const entry: SiteCatalogEntry = {
      siteId: '重慶',
      title: '重慶',
      clusterTag: 'cq-k8s-cluster',
      factoryCode: 'cq',
      defaultLogMode: 'k8s',
      loggingAvailable: true,
      robustaCoverage: false,
      robustaClusterKey: '',
      robustaAvailable: false,
    };
    const context = buildSiteDiagnosisContext(entry);

    assert.equal(context.siteId, entry.siteId);
    assert.equal(context.clusterTag, entry.clusterTag);
    assert.equal(context.factoryCode, 'cq');
    assert.ok(context.hostTypes.includes('k8s'));
    assert.ok(context.esIndices.every((x) => x.pattern === 'logs-cq-*'));
    assert.equal(context.esIndices.length, 2);
    assert.ok(context.prometheusMetrics.includes('cpu'));
    assert.ok(context.prometheusMetrics.includes('top_pod_cpu'));
  });
});

describe('Site Resource Health contract', () => {
  it('clamps topN to defaults and bounds', () => {
    assert.equal(clampResourceHealthTopN(undefined), RESOURCE_HEALTH_DEFAULT_TOP_N);
    assert.equal(clampResourceHealthTopN(NaN), RESOURCE_HEALTH_DEFAULT_TOP_N);
    assert.equal(clampResourceHealthTopN(0), 1);
    assert.equal(clampResourceHealthTopN(3.9), 3);
    assert.equal(clampResourceHealthTopN(99), 20);
  });

  it('builds empty health with equal-depth host-type sections', () => {
    const health = buildEmptySiteResourceHealth({
      siteId: 'cq-k8s-cluster',
      clusterTag: 'cq',
      topN: 5,
      warnings: ['probe'],
    });

    assert.equal(health.siteId, 'cq-k8s-cluster');
    assert.equal(health.topN, 5);
    assert.equal(health.windows.short, '15m');
    assert.equal(health.windows.medium, '1h');
    assert.deepEqual(
      health.sections.map((s) => s.hostType),
      RESOURCE_HEALTH_HOST_TYPES,
    );
    assert.ok(health.sections.every((s) => s.available === false));
    assert.equal(health.partial, true);
    assert.deepEqual(health.warnings, ['probe']);
  });

  it('ranks top offenders and finalizes partial when sections missing', () => {
    const ranked = rankTopOffenders(
      [
        { name: 'a', kind: 'node', metric: 'cpu', value: 10 },
        { name: 'b', kind: 'node', metric: 'cpu', value: 90 },
        { name: 'c', kind: 'node', metric: 'cpu', value: 50 },
      ],
      2,
    );
    assert.deepEqual(
      ranked.map((r) => r.name),
      ['b', 'c'],
    );

    const health: SiteResourceHealth = buildEmptySiteResourceHealth({
      siteId: 'cq',
      clusterTag: 'cq',
    });
    health.sections = [
      {
        hostType: 'k8s',
        available: true,
        saturation: { cpu: 12, memory: 34, disk: null },
        deltas: { '15m': null, '1h': null },
      },
      unavailableSection('baremetal'),
      unavailableSection('vm'),
      unavailableSection('docker'),
    ];
    health.top.nodes = ranked;
    finalizeResourceHealthPartial(health);
    assert.equal(health.partial, true);
  });

  it('marks non-partial when all sections available', () => {
    const health = buildEmptySiteResourceHealth({ siteId: 'cq', clusterTag: 'cq' });
    health.sections = RESOURCE_HEALTH_HOST_TYPES.map((hostType) => ({
      hostType,
      available: true,
      saturation: { cpu: 1, memory: 2, disk: 3 },
      deltas: { '15m': null, '1h': null },
    }));
    health.warnings = [];
    finalizeResourceHealthPartial(health);
    assert.equal(health.partial, false);
  });
});
