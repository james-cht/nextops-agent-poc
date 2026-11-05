import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_ROBUSTA_HISTORY_WINDOW_HOURS,
  GENERATE_HINT_TEXT,
  defaultRobustaHistorySiteId,
  nextRobustaHistoryKindFilter,
  parseRobustaHistoryKindFilter,
  parseRobustaHistoryPage,
  parseRobustaHistoryWindowHours,
  pickRobustaHistorySiteId,
  robustaHistoryHref,
  siteHasRobustaHistory,
} from './robusta-history.ts';
import type { SiteCatalogEntry } from './site-catalog-contract.ts';

function entry(
  siteId: string,
  opts: { coverage: boolean; key: string },
): SiteCatalogEntry {
  return {
    siteId,
    title: siteId,
    clusterTag: `${siteId}-tag`,
    factoryCode: 'x',
    defaultLogMode: 'k8s',
    loggingAvailable: true,
    robustaCoverage: opts.coverage,
    robustaClusterKey: opts.key,
    robustaAvailable: opts.coverage && opts.key.trim().length > 0,
  };
}

describe('siteHasRobustaHistory', () => {
  it('requires Coverage and a Cluster Key', () => {
    assert.equal(siteHasRobustaHistory({ robustaCoverage: true, robustaClusterKey: 'lh' }), true);
    assert.equal(siteHasRobustaHistory({ robustaCoverage: true, robustaClusterKey: '  ' }), false);
    assert.equal(siteHasRobustaHistory({ robustaCoverage: false, robustaClusterKey: 'lh' }), false);
  });
});

describe('defaultRobustaHistorySiteId', () => {
  it('selects the sole covered Site', () => {
    const sites = [
      entry('重慶', { coverage: false, key: '' }),
      entry('龍華', { coverage: true, key: 'lh-k8s-cluster' }),
    ];
    assert.equal(defaultRobustaHistorySiteId(sites), '龍華');
  });

  it('returns null when none or several Sites are covered', () => {
    assert.equal(defaultRobustaHistorySiteId([entry('重慶', { coverage: false, key: '' })]), null);
    assert.equal(
      defaultRobustaHistorySiteId([
        entry('龍華', { coverage: true, key: 'lh' }),
        entry('重慶', { coverage: true, key: 'cq' }),
      ]),
      null,
    );
  });
});

describe('pickRobustaHistorySiteId', () => {
  it('prefers a valid URL Site, then the sole covered Site', () => {
    const sites = [
      entry('重慶', { coverage: false, key: '' }),
      entry('龍華', { coverage: true, key: 'lh-k8s-cluster' }),
    ];
    assert.equal(pickRobustaHistorySiteId(sites, '重慶', ''), '重慶');
    assert.equal(pickRobustaHistorySiteId(sites, '', '重慶'), '龍華');
  });

  it('restores this Session when several Sites are covered, else waits', () => {
    const several = [
      entry('龍華', { coverage: true, key: 'lh' }),
      entry('重慶', { coverage: true, key: 'cq' }),
    ];
    assert.equal(pickRobustaHistorySiteId(several, '', '重慶'), '重慶');
    assert.equal(pickRobustaHistorySiteId(several, '', ''), '');
    assert.equal(pickRobustaHistorySiteId([entry('煙台', { coverage: false, key: '' })], '', ''), '');
  });
});

describe('parseRobustaHistoryWindowHours', () => {
  it('accepts 24/48/168 and defaults to 168', () => {
    assert.equal(parseRobustaHistoryWindowHours('24'), 24);
    assert.equal(parseRobustaHistoryWindowHours('48'), 48);
    assert.equal(parseRobustaHistoryWindowHours('168'), 168);
    assert.equal(parseRobustaHistoryWindowHours('7'), DEFAULT_ROBUSTA_HISTORY_WINDOW_HOURS);
    assert.equal(parseRobustaHistoryWindowHours(null), DEFAULT_ROBUSTA_HISTORY_WINDOW_HOURS);
  });
});

describe('GENERATE_HINT_TEXT', () => {
  it('points generate at the Cluster Operations Snapshot, not a later phase', () => {
    assert.match(GENERATE_HINT_TEXT, /Cluster Operations Snapshot/);
    assert.doesNotMatch(GENERATE_HINT_TEXT, /下一步開放/);
  });
});

describe('parseRobustaHistoryKindFilter', () => {
  it('accepts known kinds and ignores unknown URL kinds', () => {
    assert.deepEqual(parseRobustaHistoryKindFilter('pod_crash', null), {
      kind: 'pod_crash',
      cpuSuccess: false,
    });
    assert.equal(parseRobustaHistoryKindFilter('nope', '1'), null);
    assert.equal(parseRobustaHistoryKindFilter('', null), null);
  });

  it('treats cpuSuccess as Autoscale Success only on cpu_autoscale', () => {
    assert.deepEqual(parseRobustaHistoryKindFilter('cpu_autoscale', '1'), {
      kind: 'cpu_autoscale',
      cpuSuccess: true,
    });
    assert.equal(parseRobustaHistoryKindFilter('pod_crash', '1')?.cpuSuccess, false);
  });
});

describe('nextRobustaHistoryKindFilter', () => {
  it('cycles cpu_autoscale all ↔ success and toggles other kinds off', () => {
    assert.deepEqual(nextRobustaHistoryKindFilter(null, 'cpu_autoscale'), {
      kind: 'cpu_autoscale',
      cpuSuccess: false,
    });
    assert.deepEqual(
      nextRobustaHistoryKindFilter({ kind: 'cpu_autoscale', cpuSuccess: false }, 'cpu_autoscale'),
      { kind: 'cpu_autoscale', cpuSuccess: true },
    );
    assert.deepEqual(
      nextRobustaHistoryKindFilter({ kind: 'cpu_autoscale', cpuSuccess: true }, 'cpu_autoscale'),
      { kind: 'cpu_autoscale', cpuSuccess: false },
    );
    assert.deepEqual(nextRobustaHistoryKindFilter(null, 'pod_crash'), {
      kind: 'pod_crash',
      cpuSuccess: false,
    });
    assert.equal(
      nextRobustaHistoryKindFilter({ kind: 'pod_crash', cpuSuccess: false }, 'pod_crash'),
      null,
    );
  });
});

describe('parseRobustaHistoryPage', () => {
  it('is 1-based and floors', () => {
    assert.equal(parseRobustaHistoryPage('2'), 2);
    assert.equal(parseRobustaHistoryPage('0'), 1);
    assert.equal(parseRobustaHistoryPage('1.9'), 1);
    assert.equal(parseRobustaHistoryPage(undefined), 1);
  });
});

describe('robustaHistoryHref', () => {
  it('puts the Robusta path under the Public Base Path so onMount goto stays in-app', () => {
    assert.equal(
      robustaHistoryHref('/nextops', {
        siteId: '龍華',
        windowHours: 168,
        page: 1,
        kindFilter: null,
      }),
      `/nextops/robusta?siteId=${encodeURIComponent('龍華')}&windowHours=168&page=1`,
    );
  });

  it('emits host-root form for empty Public Base Path (laptop / dedicated host)', () => {
    assert.equal(
      robustaHistoryHref('', {
        siteId: '重慶',
        windowHours: 24,
        page: 2,
        kindFilter: null,
      }),
      `/robusta?siteId=${encodeURIComponent('重慶')}&windowHours=24&page=2`,
    );
  });

  it('drops siteId when empty and encodes kind and cpuSuccess', () => {
    assert.equal(
      robustaHistoryHref('/nextops', {
        siteId: '',
        windowHours: 48,
        page: 3,
        kindFilter: { kind: 'cpu_autoscale', cpuSuccess: true },
      }),
      '/nextops/robusta?windowHours=48&page=3&kind=cpu_autoscale&cpuSuccess=1',
    );
    assert.equal(
      robustaHistoryHref('/nextops', {
        siteId: '龍華',
        windowHours: 168,
        page: 1,
        kindFilter: { kind: 'pod_crash', cpuSuccess: false },
      }),
      `/nextops/robusta?siteId=${encodeURIComponent('龍華')}&windowHours=168&page=1&kind=pod_crash`,
    );
  });

  it('normalizes a trailing slash on Public Base Path so we never emit /nextops//robusta', () => {
    assert.equal(
      robustaHistoryHref('/nextops/', {
        siteId: '',
        windowHours: 24,
        page: 1,
        kindFilter: null,
      }),
      '/nextops/robusta?windowHours=24&page=1',
    );
  });
});
