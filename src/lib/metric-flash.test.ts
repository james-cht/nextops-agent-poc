import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldFlashMetric } from './metric-flash.ts';

describe('shouldFlashMetric', () => {
  it('skips the first paint and placeholder ---', () => {
    assert.equal(shouldFlashMetric(undefined, 99), false);
    assert.equal(shouldFlashMetric('---', 99.8), false);
    assert.equal(shouldFlashMetric(99.8, '---'), false);
    assert.equal(shouldFlashMetric(99.8, 99.8), false);
  });

  it('pings when a settled value actually moves', () => {
    assert.equal(shouldFlashMetric(99.8, 99.6), true);
    assert.equal(shouldFlashMetric('12/12', '11/12'), true);
  });
});
