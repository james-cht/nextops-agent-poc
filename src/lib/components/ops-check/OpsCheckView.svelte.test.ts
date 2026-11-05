import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import OpsCheckView from './OpsCheckView.svelte';

const report = {
  date: '2026-10-13',
  title: '雲平台服務點檢報告',
  generated_at: '2026-10-13T10:10:00',
  overall: 'WARN',
  overall_label: '需留意',
  counts: { OK: 5, WARN: 1, FAIL: 0, UNKNOWN: 0, unmonitored: 2 },
  sources: { caas: 'prometheus', saas: 'demo' },
  caas_note: null,
  has_png: false,
  site_chips: [
    { site: '龍華', nodes: 27, unmonitored: false },
    { site: 'FSJ', nodes: null, unmonitored: true },
  ],
  groups: [
    {
      site: '龍華/FSJ',
      layer: 'SaaS',
      items: [{
        id: 'saas_platforms',
        item: '數據平台可用性',
        inspectors: '徐勝祥/楊勇',
        status: 'OK',
        demo_data: true,
        remarks: ['3/3 平台可用'],
      }],
    },
    {
      site: '煙台/龍華/重慶',
      layer: 'CaaS',
      items: [{
        id: 'caas_k8s',
        item: 'K8s 容器平台',
        inspectors: '王顯彬、高維會/李成',
        status: 'WARN',
        demo_data: false,
        alert_lines: ['Failed Pod 龍華 7、煙台 4'],
      }],
    },
  ],
};

const detail = {
  id: 'caas_k8s',
  item: 'K8s 容器平台',
  site: '煙台/龍華/重慶',
  layer: 'CaaS',
  inspectors: '王顯彬、高維會/李成',
  status: 'WARN',
  demo_data: false,
  remarks: [],
  alert_lines: ['Failed Pod 龍華 7、煙台 4'],
  note_lines: [],
  date: '2026-10-13',
  checks: [{
    id: 'k8s_pods_not_running',
    name: 'K8s Failed/Pending Pod 數',
    status: 'WARN',
    query: 'sum by (cluster, phase) (kube_pod_status_phase{phase=~"Pending|Failed|Unknown"}) > 0',
    value: 7,
    threshold: { op: 'ge', warn: 1, fail: null, text: '門檻 WARN ≥1' },
    per_cluster: [
      { site: '龍華', cluster: 'lh-k8s-cluster', value: 7, implied_zero: false },
      { site: '煙台', cluster: 'yt-k8s-cluster', value: 4, implied_zero: false },
    ],
    runbook: {
      id: 'cleanup_completed_job_pods',
      title: '清理已完成的 Job Pod',
      summary: '刪除 status.phase=Failed 且所屬 Job 已完成的 Pod',
    },
  }],
};

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    report,
    history: { empty: true, days: [], items: [] },
    delivery: [],
    detail: null,
    loading: false,
    error: null,
    selectedDate: '2026-10-13',
    filter: 'all' as const,
    agentAvailable: true,
    busy: false,
    actionError: null,
    approvalNotice: null,
    onDateChange: vi.fn(),
    onRun: vi.fn(),
    onSendGmail: vi.fn(),
    onSendChat: vi.fn(),
    onFilter: vi.fn(),
    onOpenItem: vi.fn(),
    onCloseDrawer: vi.fn(),
    onRequestRunbook: vi.fn(),
    ...overrides,
  };
}

describe('OpsCheckView', () => {
  it('renders summary counts, demo tag, and no fabricated confidence', () => {
    render(OpsCheckView, { props: baseProps() });
    expect(screen.getByText('運維點檢')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('示範資料')).toBeTruthy();
    expect(screen.getByText('CaaS 真實 Prometheus')).toBeTruthy();
    expect(screen.getByText('龍華 27 節點')).toBeTruthy();
    expect(screen.getByText('FSJ')).toBeTruthy();
    expect(screen.queryByText('信心分數')).toBeNull();
    expect(screen.queryByText('0.86')).toBeNull();
  });

  it('shows an empty heatmap when no history is stored', () => {
    render(OpsCheckView, { props: baseProps() });
    expect(screen.getByText('尚無點檢歷史')).toBeTruthy();
  });

  it('opens a row and only requests approval from the runbook button', async () => {
    const user = userEvent.setup();
    const onOpenItem = vi.fn();
    const onRequestRunbook = vi.fn();
    render(OpsCheckView, {
      props: baseProps({ onOpenItem, onRequestRunbook, detail, drawerItemId: 'caas_k8s' }),
    });
    await user.click(screen.getByRole('button', { name: /K8s 容器平台/ }));
    expect(onOpenItem).toHaveBeenCalledWith('caas_k8s');
    expect(screen.getByText(/kube_pod_status_phase/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '在 PromQL 查詢開啟' }).getAttribute('href')).toContain('/admin/promql');
    await user.click(screen.getByRole('button', { name: '申請執行（需核准）' }));
    expect(onRequestRunbook).toHaveBeenCalledWith('caas_k8s', 'k8s_pods_not_running');
  });

  it('disables GE Agent with a TODO when no agent entry exists', () => {
    render(OpsCheckView, { props: baseProps({ agentAvailable: false, detail, drawerItemId: 'caas_k8s' }) });
    const button = screen.getByRole('button', { name: /交給 GE Agent 分析/ });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.textContent).toMatch(/TODO/);
  });

  it('wires GE Agent to the AI page when the entry exists', () => {
    render(OpsCheckView, { props: baseProps({ detail, drawerItemId: 'caas_k8s' }) });
    const link = screen.getByRole('link', { name: '交給 GE Agent 分析' });
    expect(link.getAttribute('href')).toContain('/ai?');
    expect(link.getAttribute('href')).toContain('item=caas_k8s');
  });

  it('sends mail only from the explicit buttons', async () => {
    const user = userEvent.setup();
    const onSendGmail = vi.fn();
    const onSendChat = vi.fn();
    const onRun = vi.fn();
    render(OpsCheckView, { props: baseProps({ onSendGmail, onSendChat, onRun }) });
    await user.click(screen.getByRole('button', { name: '立即點檢' }));
    expect(onRun).toHaveBeenCalledOnce();
    expect(onSendGmail).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '寄送 Gmail' }));
    await user.click(screen.getByRole('button', { name: '發 Google Chat' }));
    expect(onSendGmail).toHaveBeenCalledOnce();
    expect(onSendChat).toHaveBeenCalledOnce();
  });
});
