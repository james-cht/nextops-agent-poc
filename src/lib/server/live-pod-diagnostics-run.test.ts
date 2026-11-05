import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { openLocalSettingsStore, type LocalSettingsStore } from './local-settings-store.ts';
import {
  startLivePodDiagnostics,
  loadLivePodDiagnosticsResult,
  robustaApiDiagnosticContext,
  ROBUSTA_API_DIAGNOSTIC_SERVICE,
} from './live-pod-diagnostics-run.ts';

const dirs: string[] = [];
const stores: LocalSettingsStore[] = [];

afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmpStore(): LocalSettingsStore {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-lpd-'));
  dirs.push(d);
  const store = openLocalSettingsStore(path.join(d, 'nextops.sqlite'));
  stores.push(store);
  return store;
}

const k8sSource = {
  kubernetes: { namespace_name: 'mes', pod_name: 'api-7f9' },
};

describe('startLivePodDiagnostics', () => {
  it('does not occupy the pod when Robusta rejects the trigger', async () => {
    const store = tmpStore();
    const r = await startLivePodDiagnostics({
      store,
      siteId: 'yt',
      sources: [k8sSource],
      robustaCoverage: true,
      role: 'operator',
      triggerUrl: 'http://robusta.test/api/trigger',
      actionToken: 'tok',
      taskId: 'task-fail',
      fetchImpl: async () => new Response('nope', { status: 500 }),
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, 'TRIGGER_FAILED');
      assert.equal(r.upstreamStatus, 500);
      assert.match(r.upstreamMessage ?? '', /HTTP 500/);
      assert.equal((r.upstreamMessage ?? '').includes('tok'), false);
    }
    assert.equal(
      store.getLivePodOccupancy({ siteId: 'yt', namespace: 'mes', pod: 'api-7f9' }),
      null,
    );
  });

  it('releases occupancy when the Robusta trigger does not answer before the proxy budget', async () => {
    const store = tmpStore();
    const result = await Promise.race([
      startLivePodDiagnostics({
        store,
        siteId: 'yt',
        sources: [k8sSource],
        robustaCoverage: true,
        role: 'operator',
        triggerUrl: 'http://robusta.test/api/trigger',
        actionToken: 'tok',
        taskId: 'task-hang',
        triggerTimeoutMs: 40,
        fetchImpl: (_url, init) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal) return;
            if (signal.aborted) {
              reject(new Error('aborted'));
              return;
            }
            signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          }),
      }),
      new Promise<string>((resolve) => setTimeout(() => resolve('hung'), 250)),
    ]);
    assert.notEqual(result, 'hung');
    assert.equal(typeof result === 'object' && result.ok, false);
    if (typeof result === 'object' && !result.ok) assert.equal(result.code, 'TRIGGER_FAILED');
    assert.equal(
      store.getLivePodOccupancy({ siteId: 'yt', namespace: 'mes', pod: 'api-7f9' }),
      null,
    );
  });

  it('occupies the pod after Robusta accepts the trigger', async () => {
    const store = tmpStore();
    let posted: unknown;
    const r = await startLivePodDiagnostics({
      store,
      siteId: 'yt',
      sources: [k8sSource],
      robustaCoverage: true,
      role: 'operator',
      triggerUrl: 'http://robusta.test/api/trigger',
      actionToken: 'tok',
      taskId: 'task-ok',
      fetchImpl: async (_url, init) => {
        posted = JSON.parse(String(init?.body ?? ''));
        return new Response('ok', { status: 200 });
      },
    });
    assert.equal(r.ok, true);
    const occ = store.getLivePodOccupancy({ siteId: 'yt', namespace: 'mes', pod: 'api-7f9' });
    assert.equal(occ?.taskId, 'task-ok');
    assert.equal(occ?.inFlight, true);
    assert.deepEqual(posted, {
      action_name: 'k8s_pod_diagnostics',
      action_params: {
        pod_name: 'api-7f9',
        namespace: 'mes',
        token: 'tok',
        task_id: 'task-ok',
      },
    });
  });
});

describe('robustaApiDiagnosticContext', () => {
  it('names the Robusta action API, not the Robusta Store, and omits the action token', () => {
    const ctx = robustaApiDiagnosticContext({
      siteId: 'lh',
      triggerUrl: 'http://robusta.test/api/trigger',
      code: 'TRIGGER_FAILED',
      upstreamStatus: 502,
      upstreamMessage: 'Robusta API HTTP 502: bad gateway tok',
      proxyEnabled: false,
      token: 'tok',
    });
    assert.equal(ctx.service, ROBUSTA_API_DIAGNOSTIC_SERVICE);
    assert.equal(ctx.dependency, 'Robusta');
    assert.equal(ctx.service.includes('Store'), false);
    assert.equal(ctx.detail, 'HTTP 502');
    assert.equal(ctx.upstreamUrl, 'http://robusta.test/api/trigger');
    assert.equal(ctx.message.includes('tok'), false);
    assert.match(ctx.message, /\[REDACTED\]/);
  });

  it('records a missing trigger URL as Robusta API configuration', () => {
    const ctx = robustaApiDiagnosticContext({
      siteId: 'lh',
      triggerUrl: '',
      code: 'NOT_CONFIGURED',
      proxyEnabled: true,
    });
    assert.equal(ctx.service, ROBUSTA_API_DIAGNOSTIC_SERVICE);
    assert.match(ctx.message, /未設定/);
    assert.equal(ctx.upstreamUrl, undefined);
    assert.equal(ctx.proxyEnabled, true);
  });
});

describe('loadLivePodDiagnosticsResult', () => {
  it('releases occupancy when the Store row is terminal', async () => {
    const store = tmpStore();
    const key = { siteId: 'yt', namespace: 'mes', pod: 'api-7f9' };
    assert.equal(store.beginLivePodOccupancy(key, 'task-ok').ok, true);
    const loaded = await loadLivePodDiagnosticsResult({
      store,
      taskId: 'task-ok',
      query: async () => [{ task_id: 'task-ok', status: 'success', summary: 'pod healthy' }],
    });
    assert.equal(loaded.phase, 'success');
    assert.equal(loaded.row?.summary, 'pod healthy');
    assert.equal(store.getLivePodOccupancy(key)?.inFlight, false);
  });

  it('releases occupancy when the Store row is a written 健康 diagnosis', async () => {
    const store = tmpStore();
    const key = { siteId: 'yt', namespace: 'mes', pod: 'api-7f9' };
    assert.equal(store.beginLivePodOccupancy(key, 'task-health').ok, true);
    const loaded = await loadLivePodDiagnosticsResult({
      store,
      taskId: 'task-health',
      query: async () => [
        {
          task_id: 'task-health',
          status: '("status":"健康", "health_score": 100, "is_crashing": false)',
          ai_diagnosis: '服務穩定，無異常事件',
          token: 'secret',
        },
      ],
    });
    assert.equal(loaded.phase, 'success');
    assert.equal(store.getLivePodOccupancy(key)?.inFlight, false);
    assert.equal(loaded.row?.token, undefined);
    assert.equal(loaded.row?.task_id, 'task-health');
  });

  it('keeps occupancy in-flight when the Store has no row yet', async () => {
    const store = tmpStore();
    const key = { siteId: 'yt', namespace: 'mes', pod: 'api-7f9' };
    assert.equal(store.beginLivePodOccupancy(key, 'task-wait').ok, true);
    const loaded = await loadLivePodDiagnosticsResult({
      store,
      taskId: 'task-wait',
      query: async () => [],
    });
    assert.equal(loaded.phase, 'pending');
    assert.equal(loaded.row, null);
    assert.equal(store.getLivePodOccupancy(key)?.inFlight, true);
  });
});
