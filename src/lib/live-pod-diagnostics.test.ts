import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildLivePodDiagnosticsTriggerBody,
  classifyLivePodDiagnosticsRow,
  evaluateLivePodDiagnosticsSelection,
  evaluateLivePodDiagnosticsStart,
  livePodDiagnosticsGateMessage,
  livePodOccupancyForSource,
  presentLivePodDiagnosticsHttpResult,
  decideLivePodDiagnosticsClick,
  trackLivePodReselect,
  omitLivePodDiagnosticsSecret,
  readLivePodDiagnosticsRow,
  livePodDiagnosticsPhaseLabel,
  livePodDiagnosticsWaitingCopy,
} from './live-pod-diagnostics.ts';

function k8sSource(namespace: string, pod: string) {
  return {
    kubernetes: { namespace_name: namespace, pod_name: pod },
  };
}

describe('Live Pod Diagnostics selection', () => {
  it('accepts exactly one log document with Log Namespace and Log Pod', () => {
    const r = evaluateLivePodDiagnosticsSelection({
      siteId: 'yt',
      sources: [k8sSource('mes', 'api-7f9')],
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.occupancy, { siteId: 'yt', namespace: 'mes', pod: 'api-7f9' });
    }
  });

  it('blocks zero or many selected documents', () => {
    const none = evaluateLivePodDiagnosticsSelection({ siteId: 'yt', sources: [] });
    assert.equal(none.ok, false);
    if (!none.ok) assert.equal(none.code, 'NOT_ONE_ROW');

    const many = evaluateLivePodDiagnosticsSelection({
      siteId: 'yt',
      sources: [k8sSource('mes', 'a'), k8sSource('mes', 'b')],
    });
    assert.equal(many.ok, false);
    if (!many.ok) assert.equal(many.code, 'NOT_ONE_ROW');
  });

  it('blocks a row without Log Namespace and Log Pod, including Service Name fallbacks', () => {
    const missing = evaluateLivePodDiagnosticsSelection({
      siteId: 'yt',
      sources: [{ message: 'plain' }],
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, 'MISSING_POD_SCOPE');

    const containerOnly = evaluateLivePodDiagnosticsSelection({
      siteId: 'yt',
      sources: [{ container: { name: 'nginx' }, process: { name: 'java' } }],
    });
    assert.equal(containerOnly.ok, false);
    if (!containerOnly.ok) assert.equal(containerOnly.code, 'MISSING_POD_SCOPE');
  });

  it('accepts k8s.nameSpace when k8s.namespace and ECS Log Namespace are absent', () => {
    const r = evaluateLivePodDiagnosticsSelection({
      siteId: 'lh',
      sources: [
        {
          k8s: { nameSpace: 'efactory-prod', podName: 'xxljob-scheduler-57487c46fb-xm26f' },
        },
      ],
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.occupancy, {
        siteId: 'lh',
        namespace: 'efactory-prod',
        pod: 'xxljob-scheduler-57487c46fb-xm26f',
      });
    }
  });

  it('does not treat k8s.podIP or container.name as Log Pod', () => {
    const r = evaluateLivePodDiagnosticsSelection({
      siteId: 'lh',
      sources: [
        {
          k8s: { namespace: 'efactory-prod', podIP: '192.0.2.10' },
          container: { name: 'xxljob-scheduler' },
        },
      ],
    });
    assert.deepEqual(r, { ok: false, code: 'MISSING_POD_SCOPE' });
  });

  it('accepts k8s.namespace and k8s.podName when ECS Log Namespace / Log Pod are absent', () => {
    const r = evaluateLivePodDiagnosticsSelection({
      siteId: 'lh',
      sources: [
        {
          k8s: {
            hostName: 'vslhcont.node23.no.pd.dp',
            podIP: '192.0.2.11',
            podName: 'xxljob-scheduler-57487c46fb-xm26f',
            namespace: 'efactory-prod',
            containerName: 'xxljob-scheduler',
          },
        },
      ],
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.occupancy, {
        siteId: 'lh',
        namespace: 'efactory-prod',
        pod: 'xxljob-scheduler-57487c46fb-xm26f',
      });
    }
  });
});

describe('Live Pod Diagnostics start gates', () => {
  it('does not offer the action when the Site has no Robusta Coverage', () => {
    const r = evaluateLivePodDiagnosticsStart({
      siteId: 'yt',
      sources: [k8sSource('mes', 'api-7f9')],
      robustaCoverage: false,
      role: 'operator',
      occupancyInFlight: false,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'NO_COVERAGE');
  });

  it('blocks Viewer from starting', () => {
    const r = evaluateLivePodDiagnosticsStart({
      siteId: 'yt',
      sources: [k8sSource('mes', 'api-7f9')],
      robustaCoverage: true,
      role: 'viewer',
      occupancyInFlight: false,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'VIEWER');
  });

  it('blocks a second start while the same pod is in-flight', () => {
    const r = evaluateLivePodDiagnosticsStart({
      siteId: 'yt',
      sources: [k8sSource('mes', 'api-7f9')],
      robustaCoverage: true,
      role: 'operator',
      occupancyInFlight: true,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'IN_FLIGHT');
  });

  it('allows start when Coverage holds, the role may start, and the pod is free', () => {
    const r = evaluateLivePodDiagnosticsStart({
      siteId: 'yt',
      sources: [k8sSource('mes', 'api-7f9')],
      robustaCoverage: true,
      role: 'platform_owner',
      occupancyInFlight: false,
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.occupancy.pod, 'api-7f9');
  });
});

describe('classifyLivePodDiagnosticsRow', () => {
  it('keeps a missing row pending so occupancy stays in-flight until JSON is retrieved', () => {
    assert.equal(classifyLivePodDiagnosticsRow(null), 'pending');
    assert.equal(classifyLivePodDiagnosticsRow(undefined), 'pending');
  });

  it('treats any retrieved Store row as success, including unhealthy or in-flight status text', () => {
    assert.equal(classifyLivePodDiagnosticsRow({ status: 'success' }), 'success');
    assert.equal(classifyLivePodDiagnosticsRow({ status: 'failed' }), 'success');
    assert.equal(classifyLivePodDiagnosticsRow({ status: 'running' }), 'success');
    assert.equal(
      classifyLivePodDiagnosticsRow({
        status:
          '("status":"健康", "health_score": 100, "risk_factors": [], "is_crashing": false, "restart_summary": "容器無重啟")',
        ai_diagnosis: 'pod 目前健康穩定，無重啟、無異常事件，暫無需處置。',
      }),
      'success',
    );
    assert.equal(
      classifyLivePodDiagnosticsRow({
        status: '("status":"健康", "is_crashing": true)',
      }),
      'success',
    );
    assert.equal(
      classifyLivePodDiagnosticsRow({ status: '("status":"不健康", "is_crashing": false)' }),
      'success',
    );
  });
});

describe('buildLivePodDiagnosticsTriggerBody', () => {
  it('sends action_name k8s_pod_diagnostics with pod, namespace, token, and task_id', () => {
    assert.deepEqual(
      buildLivePodDiagnosticsTriggerBody({
        pod: 'api-7f9',
        namespace: 'mes',
        token: 'secret',
        taskId: 'api-task-20260904-ab',
      }),
      {
        action_name: 'k8s_pod_diagnostics',
        action_params: {
          pod_name: 'api-7f9',
          namespace: 'mes',
          token: 'secret',
          task_id: 'api-task-20260904-ab',
        },
      },
    );
  });
});

describe('livePodOccupancyForSource', () => {
  it('matches occupancy by Site + Log Namespace + Log Pod, not ES _id', () => {
    const items = [
      {
        siteId: 'yt',
        namespace: 'mes',
        pod: 'api-7f9',
        taskId: 't-1',
        inFlight: true,
      },
    ];
    const hit = livePodOccupancyForSource(items, 'yt', k8sSource('mes', 'api-7f9'));
    assert.equal(hit?.taskId, 't-1');
    assert.equal(livePodOccupancyForSource(items, 'yt', k8sSource('mes', 'other')), null);
  });

  it('matches occupancy when the in-flight key used ECS fields and the buffer row uses k8s.*', () => {
    const items = [
      {
        siteId: 'lh',
        namespace: 'efactory-prod',
        pod: 'xxljob-scheduler-57487c46fb-xm26f',
        taskId: 'task-ecs',
        inFlight: true,
      },
    ];
    const hit = livePodOccupancyForSource(items, 'lh', {
      k8s: {
        namespace: 'efactory-prod',
        podName: 'xxljob-scheduler-57487c46fb-xm26f',
      },
    });
    assert.equal(hit?.taskId, 'task-ecs');
  });
});

describe('presentLivePodDiagnosticsHttpResult', () => {
  it('opens the window with the server message when trigger returns 502 without a task id', () => {
    const view = presentLivePodDiagnosticsHttpResult({
      status: 502,
      body: { error: '無法呼叫 Robusta 觸發 API。', code: 'UPSTREAM_ERROR' },
    });
    assert.equal(view.error, '無法呼叫 Robusta 觸發 API。');
    assert.equal(view.taskId, '');
    assert.equal(view.phase, 'pending');
  });

  it('opens the window when the gateway returns 502 without a JSON body', () => {
    const view = presentLivePodDiagnosticsHttpResult({ status: 502, body: null });
    assert.match(view.error, /502/);
    assert.equal(view.taskId, '');
  });

  it('opens the window in pending when Robusta accepts', () => {
    const view = presentLivePodDiagnosticsHttpResult({
      status: 200,
      body: {
        ok: true,
        taskId: 'task-ok',
        phase: 'pending',
        occupancy: { namespace: 'mes', pod: 'api-7f9' },
      },
    });
    assert.equal(view.error, '');
    assert.equal(view.taskId, 'task-ok');
    assert.equal(view.namespace, 'mes');
    assert.equal(view.pod, 'api-7f9');
  });
});

describe('decideLivePodDiagnosticsClick', () => {
  it('opens a successful task instead of triggering until the pod is re-armed', () => {
    assert.deepEqual(
      decideLivePodDiagnosticsClick({
        selectable: true,
        inFlight: false,
        taskId: 'task-ok',
        phase: 'success',
        armed: false,
      }),
      { kind: 'open', taskId: 'task-ok' },
    );
    assert.equal(
      decideLivePodDiagnosticsClick({
        selectable: true,
        inFlight: false,
        taskId: 'task-ok',
        phase: 'success',
        armed: true,
      }).kind,
      'trigger',
    );
  });

  it('opens an in-flight task even if a re-run is armed', () => {
    assert.deepEqual(
      decideLivePodDiagnosticsClick({
        selectable: true,
        inFlight: true,
        taskId: 'task-run',
        phase: 'pending',
        armed: true,
      }),
      { kind: 'open', taskId: 'task-run' },
    );
  });

  it('triggers when the latest task failed or this pod has none', () => {
    assert.equal(
      decideLivePodDiagnosticsClick({
        selectable: true,
        inFlight: false,
        taskId: 'task-bad',
        phase: 'failure',
        armed: false,
      }).kind,
      'trigger',
    );
    assert.equal(
      decideLivePodDiagnosticsClick({
        selectable: true,
        inFlight: false,
        taskId: null,
        phase: null,
        armed: false,
      }).kind,
      'trigger',
    );
  });
});

describe('trackLivePodReselect', () => {
  it('arms a pod when a log row is checked again after being unchecked', () => {
    const cleared = trackLivePodReselect({
      armed: new Set(),
      uncheckedIds: new Set(),
      previousIds: ['row-a'],
      currentIds: [],
      podKeyById: () => 'pod-a',
    });
    assert.equal(cleared.armed.size, 0);
    const rechecked = trackLivePodReselect({
      armed: cleared.armed,
      uncheckedIds: cleared.uncheckedIds,
      previousIds: [],
      currentIds: ['row-a'],
      podKeyById: () => 'pod-a',
    });
    assert.equal(rechecked.armed.has('pod-a'), true);
  });

  it('does not arm another pod the first time its row is checked', () => {
    const next = trackLivePodReselect({
      armed: new Set(),
      uncheckedIds: new Set(),
      previousIds: ['row-a'],
      currentIds: ['row-b'],
      podKeyById: (id) => (id === 'row-a' ? 'pod-a' : 'pod-b'),
    });
    assert.equal(next.armed.has('pod-b'), false);
    assert.equal(next.uncheckedIds.has('row-a'), true);
  });
});

describe('readLivePodDiagnosticsRow', () => {
  it('reads the Store row as a diagnosis view and a KubeSphere pod link', () => {
    const reading = readLivePodDiagnosticsRow({
      id: 28,
      task_id: 'api-task-20260929-edd7ffde',
      cluster_id: 'host',
      namespace: 'longgong-prod',
      pod_name: 'authorization-server-78775bff88-44ptx',
      container_name: 'log-monitor',
      alert_name: 'PodResourceAnomalyApiTrigger',
      cpu_limit: '未設定',
      cpu_usage: '0.079 Cores',
      cpu_trend_1h: '-0.005 Cores/h',
      mem_limit: '未設定',
      mem_usage: '1.04 MiB',
      mem_trend_1h: '0.37 MiB/h',
      node_name: 'cont.node6.no.pd.dp',
      node_cpu_usage: '14.87%',
      node_mem_usage: '65.55%',
      events_summary: '無異常事件',
      ai_diagnosis: 'Pod 目前運行正常，但 authorization-server 曾異常重啟。',
      status:
        '{"status": "亞健康/有風險", "health_score": 80, "risk_factors": ["歷史重啟: 容器 [authorization-server] 重啟 1 次"], "is_crashing": false, "restart_summary": "容器 [authorization-server] 重啟 1 次", "pod_url": "https://ks-hep.corp.example.com/d-group-paas/clusters/host/projects/longgong-prod/pods/authorization-server-78775bff88-44ptx/resource-status"}',
      created_at: '2026-09-29T14:51:44.000Z',
      token: 'secret',
    });
    assert.ok(reading);
    assert.equal(reading.conclusion, '亞健康/有風險');
    assert.equal(reading.healthScore, '80');
    assert.equal(reading.diagnosis, 'Pod 目前運行正常，但 authorization-server 曾異常重啟。');
    assert.equal(
      reading.podUrl,
      'https://ks-hep.corp.example.com/d-group-paas/clusters/host/projects/longgong-prod/pods/authorization-server-78775bff88-44ptx/resource-status',
    );
    assert.equal(reading.resources.find((field) => field.label === 'CPU 上限')?.value, '未設定');
    assert.deepEqual(
      reading.risks.find((field) => field.label === '風險因素')?.values,
      ['歷史重啟: 容器 [authorization-server] 重啟 1 次'],
    );
    assert.equal(reading.identity.find((field) => field.label === '時間')?.value, '2026-09-29T14:51:44.000Z');
    const packed = JSON.stringify(reading);
    assert.equal(packed.includes('api-task-20260929-edd7ffde'), false);
    assert.equal(packed.includes('is_crashing'), false);
    assert.equal(packed.includes('secret'), false);
  });

  it('shows an unparsed status as text and skips a non-http pod link and empty fields', () => {
    const reading = readLivePodDiagnosticsRow({
      cpu_usage: '',
      cpu_limit: '未設定',
      events_summary: '',
      status:
        '{"status": "健康", "risk_factors": [], "pod_url": "javascript:alert(1)"}',
    });
    assert.ok(reading);
    assert.equal(reading.conclusion, '健康');
    assert.equal(reading.podUrl, null);
    assert.equal(reading.resources.length, 1);
    assert.equal(reading.resources[0]?.label, 'CPU 上限');
    assert.equal(reading.risks.length, 0);

    const raw = readLivePodDiagnosticsRow({ status: '尚未寫成 JSON', cpu_usage: '1 Cores' });
    assert.ok(raw);
    assert.equal(raw.conclusion, '尚未寫成 JSON');
    assert.equal(raw.healthScore, null);
    assert.equal(raw.podUrl, null);
    assert.equal(readLivePodDiagnosticsRow(null), null);
  });
});

describe('omitLivePodDiagnosticsSecret', () => {
  it('drops the action token before the window shows the row', () => {
    const shown = omitLivePodDiagnosticsSecret({
      task_id: 't',
      token: 'secret',
      status: '健康',
    }) as { task_id: string; status: string; token?: string };
    assert.equal(shown.token, undefined);
    assert.equal(shown.status, '健康');
    assert.equal(shown.task_id, 't');
  });
});

describe('livePodDiagnosticsPhaseChrome', () => {
  it('labels a finished task and waits only while the row is still pending', () => {
    assert.equal(livePodDiagnosticsPhaseLabel('success'), '成功');
    assert.equal(livePodDiagnosticsPhaseLabel('failure'), '失敗');
    assert.equal(livePodDiagnosticsPhaseLabel('pending'), '失敗');
    assert.match(livePodDiagnosticsWaitingCopy('pending', 'task-1'), /正在等待 Robusta 寫入結果/);
    assert.equal(livePodDiagnosticsWaitingCopy('success', 'task-1'), '');
    assert.equal(livePodDiagnosticsWaitingCopy('failure', 'task-1'), '');
  });
});

describe('livePodDiagnosticsGateMessage', () => {
  it('tells the operator to wait when the pod is in-flight', () => {
    assert.match(livePodDiagnosticsGateMessage('IN_FLIGHT'), /進行中/);
  });
});
