import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCssVars, categories } from './font-size-config.ts';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as unknown as Record<string, unknown>).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

test('categories has at least one category with a non-empty sizes array', () => {
  const hasCategoryWithSizes = categories.some(
    (cat) => Array.isArray(cat.sizes) && cat.sizes.length > 0
  );
  assert.equal(hasCategoryWithSizes, true);
});

test('buildCssVars includes custom font size and all keys start with --', () => {
  const cssVars = buildCssVars({ 'fs-body': '16px' });
  assert.equal(cssVars['--fs-body'], '16px');

  const keys = Object.keys(cssVars);
  assert.ok(keys.length > 0);
  for (const key of keys) {
    assert.ok(key.startsWith('--'), `Key "${key}" should start with "--"`);
  }
});
