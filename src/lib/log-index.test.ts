import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assembleLogIndexPattern,
  applyWeekExpansion,
  resolveLogIndex,
  validateLogIndexPattern,
  listIsoWeeksInRange,
  defaultSiteLogPattern,
  shortIndexPattern,
} from './log-index.ts';

describe('assembleLogIndexPattern', () => {
  it('builds non_k8s default', () => {
    const r = assembleLogIndexPattern({ factoryCode: 'lh', mode: 'non_k8s' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.index, 'logs-lh-*');
  });

  it('builds k8s site wildcard without namespace/pod segments', () => {
    const base = assembleLogIndexPattern({ factoryCode: 'lh', mode: 'k8s' });
    assert.ok(base.ok && base.index === 'logs-lh-*');
  });
});

describe('validateLogIndexPattern', () => {
  it('accepts patterns under factory prefix', () => {
    assert.equal(validateLogIndexPattern('logs-lh-*', 'logs', 'lh'), null);
    assert.equal(validateLogIndexPattern('logs-lh-prod-api-*', 'logs', 'lh'), null);
  });

  it('rejects cross-site and dangerous patterns', () => {
    assert.match(validateLogIndexPattern('logs-cq-*', 'logs', 'lh') ?? '', /under/);
    assert.match(validateLogIndexPattern('logs-lh,logs-cq', 'logs', 'lh') ?? '', /comma/);
    assert.match(validateLogIndexPattern('_all', 'logs', 'lh') ?? '', /forbidden|under/);
  });
});

describe('week expansion', () => {
  it('expands non_k8s to concrete week indices', () => {
    const weeks = listIsoWeeksInRange('2026-08-05T00:00:00.000Z', '2026-08-05T12:00:00.000Z');
    assert.ok(weeks.length >= 1);
    const expanded = applyWeekExpansion('logs-lh-*', 'non_k8s', weeks);
    assert.ok(expanded.includes('logs-lh-'));
    assert.ok(!expanded.endsWith('-*'));
  });

  it('does not rewrite custom index in resolveLogIndex', () => {
    const r = resolveLogIndex({
      factoryCode: 'lh',
      mode: 'k8s',
      index: 'logs-lh-prod-*',
      timeFrom: '2026-08-01T00:00:00.000Z',
      timeTo: '2026-08-05T00:00:00.000Z',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.index, 'logs-lh-prod-*');
      assert.equal(r.assembled, false);
    }
  });

  it('does not expand weeks by default (daily production indices)', () => {
    const r = resolveLogIndex({
      factoryCode: 'yt',
      mode: 'k8s',
      timeFrom: '2026-08-05T00:00:00.000Z',
      timeTo: '2026-08-06T00:00:00.000Z',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.index, 'logs-yt-*');
      assert.equal(r.assembled, true);
    }
  });

  it('expands weeks only when expandWeeks is true', () => {
    const r = resolveLogIndex({
      factoryCode: 'yt',
      mode: 'k8s',
      timeFrom: '2026-08-05T00:00:00.000Z',
      timeTo: '2026-08-05T12:00:00.000Z',
      expandWeeks: true,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.match(r.index, /logs-yt-\*-2026\.\d{2}/);
    }
  });
});

describe('defaultSiteLogPattern', () => {
  it('uses prefix + factoryCode', () => {
    assert.equal(defaultSiteLogPattern('logs', 'cq'), 'logs-cq-*');
  });
});

describe('shortIndexPattern', () => {
  it('keeps short patterns intact', () => {
    assert.equal(shortIndexPattern('logs-lh-*'), 'logs-lh-*');
  });

  it('ellipsis-prefixes long Watchlist patterns', () => {
    const long =
      'logs-lh-efactory-prod-xxljob-scheduler-57487c46fb-xm26f-*logs-lh-efactory-prod-xxljob-scheduler-57487c46fb-xm26f';
    const shown = shortIndexPattern(long, 36);
    assert.ok(shown.startsWith('…'));
    assert.ok(shown.length <= 36);
    assert.ok(long.endsWith(shown.slice(1)));
  });
});
