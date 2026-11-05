/**
 * Default Log Category seeds (ADR-0022) — editable/deletable after copy.
 */

import type { CategoryRule } from './log-document-filter.ts';

export type LogCategorySeed = {
  id: string;
  name: string;
  rule: CategoryRule;
};

export const LOG_CATEGORY_SEEDS: LogCategorySeed[] = [
  {
    id: 'seed-errors',
    name: '錯誤詞',
    rule: {
      documentFilters: [],
      messagePattern: {
        type: 'regex',
        value: 'error|exception|fatal|panic',
      },
    },
  },
  {
    id: 'seed-5xx',
    name: '5xx',
    rule: {
      documentFilters: [],
      ranges: [{ path: 'http.response.status_code', gte: 500, lte: 599 }],
      messagePattern: null,
    },
  },
  {
    id: 'seed-timeout',
    name: 'Timeout',
    rule: {
      documentFilters: [],
      messagePattern: {
        type: 'regex',
        value: 'timeout|timed\\s*out',
      },
    },
  },
  {
    id: 'seed-conn-fail',
    name: '連線失敗',
    rule: {
      documentFilters: [],
      messagePattern: {
        type: 'regex',
        value: 'connection\\s+(refused|reset|reset by peer)',
      },
    },
  },
];

export type StoredLogCategory = {
  id: string;
  name: string;
  rule: CategoryRule;
};

export function seedLogCategories(): StoredLogCategory[] {
  return LOG_CATEGORY_SEEDS.map((s) => ({
    id: s.id,
    name: s.name,
    rule: structuredClone(s.rule),
  }));
}
