import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildAlertFilterSearchParams,
  readAlertFiltersFromSearchParams,
  simulateAlertFilterLoadCycle,
} from './alert-list-filters.ts';

describe('alert list filter effect contract (repro)', () => {
  it('BUG: tracking local filters clobbers dropdown selection from stale URL', () => {
    const { filtersUsedForFetch, clobbered } = simulateAlertFilterLoadCycle({
      url: new URLSearchParams(), // URL not updated yet
      localAfterBind: { severity: 'critical' },
      trackLocalFilters: true,
    });

    assert.equal(clobbered, true);
    assert.equal(
      filtersUsedForFetch.severity,
      '',
      'stale URL sync wipes critical → fetch runs unfiltered',
    );
  });

  it('FIX: URL-driven load keeps the selected severity for fetch', () => {
    const { filtersUsedForFetch, clobbered } = simulateAlertFilterLoadCycle({
      url: new URLSearchParams(),
      localAfterBind: { severity: 'critical' },
      trackLocalFilters: false,
    });

    assert.equal(clobbered, false);
    assert.equal(filtersUsedForFetch.severity, 'critical');
  });

  it('FIX: URL-driven load keeps combined site + status filters', () => {
    const { filtersUsedForFetch } = simulateAlertFilterLoadCycle({
      url: new URLSearchParams(),
      localAfterBind: { site: 'lh-k8s-cluster', status: 'firing' },
      trackLocalFilters: false,
    });

    assert.equal(filtersUsedForFetch.site, 'lh-k8s-cluster');
    assert.equal(filtersUsedForFetch.status, 'firing');
  });

  it('round-trips site/severity/status through search params', () => {
    const nowMs = Date.parse('2026-08-12T12:00:00.000Z');
    const params = buildAlertFilterSearchParams(
      {
        site: 'lh-k8s-cluster',
        severity: 'warning',
        status: 'firing',
        search: '',
        timeRange: 'all',
        timeFrom: '',
        activeFrom: '',
        activeTo: '',
      },
      nowMs,
    );
    const back = readAlertFiltersFromSearchParams(params, nowMs);
    assert.equal(back.site, 'lh-k8s-cluster');
    assert.equal(back.severity, 'warning');
    assert.equal(back.status, 'firing');
  });

  it('restores timeRange preset from timeFrom on URL sync', () => {
    const nowMs = Date.parse('2026-08-12T12:00:00.000Z');
    const params = buildAlertFilterSearchParams(
      {
        site: '',
        severity: '',
        status: 'all',
        search: '',
        timeRange: '1h',
        timeFrom: '',
        activeFrom: '',
        activeTo: '',
      },
      nowMs,
    );
    const back = readAlertFiltersFromSearchParams(params, nowMs);
    assert.equal(back.timeRange, '1h');
  });

  it('preserves opaque timeFrom that is not a known preset', () => {
    const nowMs = Date.parse('2026-08-12T12:00:00.000Z');
    const sp = new URLSearchParams({ timeFrom: '2026-08-01T00:00:00.000Z' });
    const state = readAlertFiltersFromSearchParams(sp, nowMs);
    assert.equal(state.timeRange, 'all');
    assert.equal(state.timeFrom, '2026-08-01T00:00:00.000Z');
    const back = buildAlertFilterSearchParams(state, nowMs);
    assert.equal(back.get('timeFrom'), '2026-08-01T00:00:00.000Z');
  });
});
