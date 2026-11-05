import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  abnormalCount,
  actualValue,
  chipLabel,
  distributionText,
  filterItems,
  flattenItems,
  geAgentHref,
  heatmapEmpty,
  promqlHref,
  rowRemark,
  sortWorstFirst,
  type OpsReport,
} from './ops-check.ts';

const report: OpsReport = {
  date: '2026-10-13',
  title: '雲平台服務點檢報告',
  overall: 'WARN',
  overall_label: '需留意',
  counts: { OK: 5, WARN: 1, FAIL: 0, UNKNOWN: 0, unmonitored: 2 },
  sources: { caas: 'prometheus', saas: 'demo' },
  caas_note: null,
  has_png: true,
  site_chips: [
    { site: '龍華', nodes: 27, unmonitored: false },
    { site: 'FSJ', nodes: null, unmonitored: true },
  ],
  groups: [
    {
      site: '龍華/FSJ',
      layer: 'SaaS',
      items: [
        {
          id: 'saas_platforms',
          item: '數據平台可用性',
          inspectors: '徐勝祥/楊勇',
          status: 'OK',
          demo_data: true,
          remarks: ['3/3 平台可用'],
        },
      ],
    },
    {
      site: '煙台/龍華/重慶',
      layer: 'CaaS',
      items: [
        {
          id: 'caas_k8s',
          item: 'K8s 容器平台',
          inspectors: '王顯彬、高維會/李成',
          status: 'WARN',
          demo_data: false,
          alert_lines: ['Failed Pod 龍華 7、煙台 4'],
          remarks: ['K8s 節點 龍華 27/27 Ready'],
        },
        {
          id: 'caas_storage',
          item: '存儲（Ceph, MinIO）',
          inspectors: '高維會/李成',
          status: 'OK',
          remarks: ['Ceph HEALTH_OK'],
          note_lines: ['MinIO：尚未接入 Prometheus exporter，目前未監控'],
        },
      ],
    },
  ],
};

describe('ops check view model', () => {
  it('sorts rows worst-first and keeps demo rows tagged by the payload', () => {
    const rows = sortWorstFirst(flattenItems(report));
    assert.deepEqual(rows.map((row) => row.id), ['caas_k8s', 'saas_platforms', 'caas_storage']);
    assert.equal(rows.find((row) => row.id === 'saas_platforms')?.demo_data, true);
    assert.equal(rows.find((row) => row.id === 'caas_k8s')?.demo_data, false);
  });

  it('filters abnormal, CaaS, and SaaS without inventing rows', () => {
    const rows = flattenItems(report);
    assert.deepEqual(filterItems(rows, 'abnormal').map((row) => row.id), ['caas_k8s']);
    assert.equal(filterItems(rows, 'SaaS').every((row) => row.layer === 'SaaS'), true);
    assert.equal(abnormalCount(report.counts), 1);
  });

  it('shows only numbers present on the report', () => {
    assert.equal(chipLabel(report.site_chips[0]), '龍華 27 節點');
    assert.equal(chipLabel(report.site_chips[1]), 'FSJ');
    assert.equal(chipLabel({ site: 'CTTV', nodes: null }), 'CTTV');
  });

  it('prefers alert text for the row remark', () => {
    const k8s = flattenItems(report).find((row) => row.id === 'caas_k8s');
    assert.equal(rowRemark(k8s!), 'Failed Pod 龍華 7、煙台 4');
  });

  it('treats missing history as empty and does not fill statuses', () => {
    assert.equal(heatmapEmpty(null), true);
    assert.equal(heatmapEmpty({ empty: true, days: ['2026-10-13'], items: [] }), true);
    assert.equal(
      heatmapEmpty({
        empty: false,
        days: ['2026-10-12', '2026-10-13'],
        items: [{ id: 'caas_k8s', statuses: { '2026-10-12': null, '2026-10-13': 'WARN' } }],
      }),
      false,
    );
  });

  it('sums cluster evidence for the actual value and links the agent only when one exists', () => {
    const actual = actualValue({
      value: 7,
      per_cluster: [
        { site: '龍華', value: 7, implied_zero: false },
        { site: '煙台', value: 4, implied_zero: false },
        { site: '重慶', value: 0, implied_zero: true },
      ],
    });
    assert.equal(actual, 11);
    assert.equal(distributionText([
      { site: '龍華', value: 7 },
      { site: '煙台', value: 4 },
    ]), '龍華 7 · 煙台 4');
    assert.equal(actualValue({ value: null, per_cluster: [] }), null);
    assert.equal(geAgentHref('', true, 'caas_k8s', '2026-10-13'), '/ai?from=ops-check&item=caas_k8s&date=2026-10-13');
    assert.equal(
      geAgentHref('/nextops', true, 'caas_k8s', '2026-10-13'),
      '/nextops/ai?from=ops-check&item=caas_k8s&date=2026-10-13',
    );
    assert.equal(geAgentHref('/nextops/', false, 'caas_k8s', '2026-10-13'), null);
    assert.equal(promqlHref('', 'sum by (cluster) (up)'), '/admin/promql?q=sum+by+%28cluster%29+%28up%29');
    assert.equal(promqlHref('/nextops/', null), '/nextops/admin/promql');
  });
});
