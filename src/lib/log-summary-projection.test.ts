import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getByPath,
  resolveServiceName,
  projectLogSummary,
} from './log-summary-projection.ts';

test('getByPath retrieves value at dot-separated path', () => {
  assert.equal(getByPath({ a: { b: 1 } }, 'a.b'), 1);
});

test('resolveServiceName returns pod_name when available', () => {
  assert.equal(
    resolveServiceName({ kubernetes: { pod_name: 'demo' } }),
    'demo'
  );
});

test('projectLogSummary projects message and httpStatus', () => {
  const projected = projectLogSummary({
    message: 'hello',
    'http.response.status_code': 200,
  });
  assert.equal(projected.message, 'hello');
  assert.equal(projected.httpStatus, '200');
});
