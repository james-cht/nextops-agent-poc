import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collapseIndexToFamily,
  collapseIndicesToFamilies,
  filterIndexFamilies,
} from './log-index-family.ts';
import { projectLogSummary, resolveServiceName, flattenLogFields, getByPath } from './log-summary-projection.ts';
import {
  parseDocumentFiltersParam,
  buildDocumentFilterClauses,
  buildCategoryRuleEsClauses,
} from './log-document-filter.ts';
import { seedLogCategories } from './log-category-seeds.ts';
import { computeLogHighlights, applyHighlightSegments } from './log-highlight.ts';

describe('log-index-family', () => {
  it('collapses daily suffix to family', () => {
    assert.equal(
      collapseIndexToFamily('logs-lh-k8s-es-log-2026.08.25'),
      'logs-lh-k8s-es-log-*',
    );
  });

  it('collapses week-style suffix', () => {
    assert.equal(collapseIndexToFamily('logs-lh-2026.32'), 'logs-lh-*');
  });

  it('dedupes families', () => {
    assert.deepEqual(
      collapseIndicesToFamilies([
        'logs-lh-k8s-es-log-2026.08.25',
        'logs-lh-k8s-es-log-2026.08.26',
        'logs-lh-other-2026.08.25',
      ]),
      ['logs-lh-k8s-es-log-*', 'logs-lh-other-*'],
    );
  });

  it('filters fuzzy and regex', () => {
    const families = ['logs-lh-k8s-es-log-*', 'logs-lh-nginx-access-*'];
    assert.deepEqual(filterIndexFamilies(families, 'nginx', 'fuzzy'), {
      ok: true,
      families: ['logs-lh-nginx-access-*'],
    });
    const re = filterIndexFamilies(families, 'k8s.*es-log', 'regex');
    assert.equal(re.ok, true);
    if (re.ok) assert.deepEqual(re.families, ['logs-lh-k8s-es-log-*']);
  });
});

describe('log-summary-projection', () => {
  it('resolves Service Name pod → container → process', () => {
    assert.equal(resolveServiceName({ kubernetes: { pod_name: 'nginx-x' } }), 'nginx-x');
    assert.equal(resolveServiceName({ container: { name: 'sidecar' } }), 'sidecar');
    assert.equal(resolveServiceName({ process: { name: 'java' } }), 'java');
  });

  it('projects summary columns without inventing HTTP from message', () => {
    const row = projectLogSummary({
      '@timestamp': '2026-08-25T00:00:00.000Z',
      kubernetes: { pod_name: 'api-1' },
      message: 'GET /x 502',
      http: { response: { status_code: 502 }, request: { method: 'GET' } },
      url: { path: '/x' },
      network: { protocol: 'http' },
      user_agent: { original: 'curl/8' },
    });
    assert.equal(row.serviceName, 'api-1');
    assert.equal(row.httpStatus, '502');
    assert.equal(row.httpMethod, 'GET');
    assert.equal(row.path, '/x');
    assert.equal(row.networkProtocol, 'http');
    assert.equal(row.userAgent, 'curl/8');
  });

  it('flattens nested fields', () => {
    const flat = flattenLogFields({ a: { b: 1 }, c: 'x' });
    assert.deepEqual(flat, [
      { path: 'a.b', value: 1 },
      { path: 'c', value: 'x' },
    ]);
    assert.equal(getByPath({ a: { b: 2 } }, 'a.b'), 2);
  });
});

describe('log-document-filter', () => {
  it('parses and builds term filters', () => {
    const parsed = parseDocumentFiltersParam(
      JSON.stringify([{ path: 'kubernetes.pod_name', value: 'nginx' }]),
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(buildDocumentFilterClauses(parsed.filters), [
      { term: { 'kubernetes.pod_name': 'nginx' } },
    ]);
  });

  it('builds category range for 5xx', () => {
    const { filter } = buildCategoryRuleEsClauses({
      documentFilters: [],
      ranges: [{ path: 'http.response.status_code', gte: 500, lte: 599 }],
    });
    assert.deepEqual(filter, [
      { range: { 'http.response.status_code': { gte: 500, lte: 599 } } },
    ]);
  });
});

describe('log-category-seeds', () => {
  it('seeds four editable categories', () => {
    const seeds = seedLogCategories();
    assert.equal(seeds.length, 4);
    assert.ok(seeds.some((s) => s.name === '5xx'));
  });
});

describe('log-highlight', () => {
  it('highlights lexicon and keyword', () => {
    const spans = computeLogHighlights('Connection refused ERROR at end', {
      keyword: 'refused',
    });
    assert.ok(spans.length >= 2);
    const parts = applyHighlightSegments('Connection refused ERROR at end', spans);
    assert.ok(parts.some((p) => p.kind === 'keyword' || p.kind === 'lexicon'));
  });
});
