import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOG_CATEGORY_SEEDS, seedLogCategories } from './log-category-seeds.ts';

test('LOG_CATEGORY_SEEDS has more than one entry', () => {
  assert.ok(LOG_CATEGORY_SEEDS.length > 1);
});

test('every seed has non-empty id and name', () => {
  for (const seed of LOG_CATEGORY_SEEDS) {
    assert.ok(typeof seed.id === 'string' && seed.id.length > 0);
    assert.ok(typeof seed.name === 'string' && seed.name.length > 0);
  }
});

test('seedLogCategories() returns the same ids as the seeds', () => {
  const result = seedLogCategories();
  assert.deepStrictEqual(
    result.map((category) => category.id),
    LOG_CATEGORY_SEEDS.map((seed) => seed.id)
  );
});

test('mutating a returned category rule does not change LOG_CATEGORY_SEEDS', () => {
  const categories = seedLogCategories();
  const originalRule = LOG_CATEGORY_SEEDS[0].rule;

  categories[0].rule.documentFilters.push('test-filter');
  assert.deepStrictEqual(LOG_CATEGORY_SEEDS[0].rule, originalRule);
});
