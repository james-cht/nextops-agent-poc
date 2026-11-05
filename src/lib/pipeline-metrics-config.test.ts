import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

import {
  buildPipelineMetricsQueryString,
  buildPipelineTimeoutsHref,
} from './pipeline-metrics-config.ts';

describe('pipeline-metrics-config builders', () => {
  it('buildPipelineMetricsQueryString contains thresholdSec and windowHours', () => {
    const queryString = buildPipelineMetricsQueryString();
    assert.ok(queryString.includes('thresholdSec='));
    assert.ok(queryString.includes('windowHours='));
  });

  it('buildPipelineTimeoutsHref with publicBasePath starts with expected path', () => {
    const href = buildPipelineTimeoutsHref({ publicBasePath: '/app' });
    assert.ok(href.startsWith('/app/pipelines/timeouts?'));
  });

  it('buildPipelineTimeoutsHref with appName includes appName=demo', () => {
    const href = buildPipelineTimeoutsHref({ appName: 'demo' });
    assert.ok(href.includes('appName=demo'));
  });
});
