import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROMQL_QUERIES, PROMQL_METADATA } from './promql-config.ts';

test('DEFAULT_PROMQL_QUERIES has required default query keys with non-empty string values', () => {
  const expectedKeys = ['cpu', 'memory', 'disk', 'node_total', 'node_online'] as const;

  for (const key of expectedKeys) {
    assert.ok(key in DEFAULT_PROMQL_QUERIES, `Expected key '${key}' to exist in DEFAULT_PROMQL_QUERIES`);
    const value = DEFAULT_PROMQL_QUERIES[key];
    assert.equal(typeof value, 'string', `Expected value for key '${key}' to be a string`);
    assert.ok(value.trim().length > 0, `Expected value for key '${key}' to be a non-empty string`);
  }
});

test('PROMQL_METADATA length and keys match DEFAULT_PROMQL_QUERIES', () => {
  const defaultQueryKeys = Object.keys(DEFAULT_PROMQL_QUERIES);
  assert.equal(
    PROMQL_METADATA.length,
    defaultQueryKeys.length,
    'PROMQL_METADATA length should match the number of default query keys'
  );

  for (const item of PROMQL_METADATA) {
    assert.ok(
      item.key in DEFAULT_PROMQL_QUERIES,
      `Expected metadata key '${item.key}' to exist in DEFAULT_PROMQL_QUERIES`
    );
  }
});
