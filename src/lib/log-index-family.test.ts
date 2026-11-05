import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collapseIndexToFamily,
  collapseIndicesToFamilies,
  filterIndexFamilies,
} from './log-index-family.ts';

test('collapseIndexToFamily ends with -*', () => {
  const result = collapseIndexToFamily('app-logs-2024.01.02');
  assert.ok(result.endsWith('-*'));
});

test('collapseIndicesToFamilies dedupes families', () => {
  const result = collapseIndicesToFamilies(['app-logs-2024.01.01', 'app-logs-2024.01.02']);
  assert.deepEqual(result, ['app-logs-*']);
});

test('filterIndexFamilies keeps only matching family for fuzzy query', () => {
  const result = filterIndexFamilies(['alpha', 'beta'], 'alp');
  assert.deepEqual(result, ['alpha']);
});

test('filterIndexFamilies returns all families when query is empty', () => {
  const result = filterIndexFamilies(['alpha', 'beta'], '');
  assert.deepEqual(result, ['alpha', 'beta']);
});
