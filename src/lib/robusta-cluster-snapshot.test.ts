import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRobustaClusterSnapshot,
  pickRobustaGenerateExemplars,
  buildRobustaHistoryReportPrompt,
  stripRobustaSnapshotForPage,
  robustaGenerateActionHint,
  canStartRobustaHistoryGenerate,
  assembleRobustaClusterInsight,
  buildRobustaSnapshotApiBody,
  ROBUSTA_GENERATE_EXEMPLAR_CAP,
  robustaGenerateIsBlocked,
  robustaWorkloadKey,
  type RobustaEventFact,
} from './robusta-cluster-snapshot.ts';

describe('robustaWorkloadKey', () => {
  it('strips Deployment replica hashes so the same workload ranks together', () => {
    assert.equal(
      robustaWorkloadKey('checkout-7d9f8c6b5-xk2m9'),
      'checkout',
    );
    assert.equal(
      robustaWorkloadKey('checkout-7d9f8c6b5-ab12c'),
      'checkout',
    );
  });

  it('leaves StatefulSet ordinals and bare names unchanged', () => {
    assert.equal(robustaWorkloadKey('mysql-0'), 'mysql-0');
    assert.equal(robustaWorkloadKey('api'), 'api');
  });
});

function fact(partial: Partial<RobustaEventFact> & Pick<RobustaEventFact, 'id' | 'kind'>): RobustaEventFact {
  return {
    namespace: 'prod',
    podName: 'app-7d9f8c6b5-aaaaa',
    containerName: 'app',
    nodeName: '',
    status: '',
    startedAt: '2026-08-31T00:00:00.000Z',
    ...partial,
  };
}

describe('buildRobustaClusterSnapshot', () => {
  it('counts mix by kind and treats cpu_autoscale as an action, not a failure', () => {
    const snapshot = buildRobustaClusterSnapshot(
      [
        fact({ id: 'memory_diagnose:1', kind: 'memory_diagnose' }),
        fact({ id: 'memory_diagnose:2', kind: 'memory_diagnose', podName: 'other-7d9f8c6b5-bbbbb' }),
        fact({ id: 'cpu_autoscale:1', kind: 'cpu_autoscale', status: 'scaled' }),
        fact({ id: 'pod_crash:1', kind: 'pod_crash', status: 'CrashLoopBackOff' }),
      ],
      { windowHours: 168 },
    );
    assert.equal(snapshot.total, 4);
    assert.equal(snapshot.windowHours, 168);
    const byKind = Object.fromEntries(snapshot.mix.map((row) => [row.kind, row]));
    assert.equal(byKind.memory_diagnose?.count, 2);
    assert.equal(byKind.memory_diagnose?.isAction, false);
    assert.equal(byKind.cpu_autoscale?.count, 1);
    assert.equal(byKind.cpu_autoscale?.isAction, true);
    assert.equal(byKind.pod_crash?.count, 1);
    assert.equal(byKind.java_oom?.count ?? 0, 0);
    assert.equal(snapshot.autoscaleSuccessCount, 1);
  });

  it('ranks repeat-offender workloads by replica-stripped key', () => {
    const snapshot = buildRobustaClusterSnapshot(
      [
        fact({ id: 'java_oom:1', kind: 'java_oom', podName: 'checkout-7d9f8c6b5-aaaaa' }),
        fact({ id: 'java_oom:2', kind: 'java_oom', podName: 'checkout-7d9f8c6b5-bbbbb' }),
        fact({ id: 'memory_diagnose:1', kind: 'memory_diagnose', podName: 'checkout-7d9f8c6b5-ccccc' }),
        fact({ id: 'pod_crash:1', kind: 'pod_crash', namespace: 'kube-system', podName: 'coredns-1' }),
      ],
      { windowHours: 24 },
    );
    assert.equal(snapshot.topWorkloads[0]?.workloadKey, 'checkout');
    assert.equal(snapshot.topWorkloads[0]?.namespace, 'prod');
    assert.equal(snapshot.topWorkloads[0]?.count, 3);
    assert.deepEqual(snapshot.topWorkloads[0]?.kinds.sort(), ['java_oom', 'memory_diagnose']);
    assert.equal(snapshot.crossKind[0]?.workloadKey, 'checkout');
    assert.ok(snapshot.crossKind[0]?.kinds.includes('java_oom'));
    assert.ok(snapshot.crossKind[0]?.kinds.includes('memory_diagnose'));
  });

  it('ranks node pressure and keeps Store reason values', () => {
    const snapshot = buildRobustaClusterSnapshot(
      [
        fact({
          id: 'cpu_autoscale:1',
          kind: 'cpu_autoscale',
          nodeName: 'node-a',
          status: 'hit_safety_cap',
          nodeUsagePct: 92,
          safetyMaxLimitM: 4000,
        }),
        fact({
          id: 'memory_diagnose:1',
          kind: 'memory_diagnose',
          nodeName: 'node-a',
          memIncrease1h: '512Mi',
        }),
        fact({
          id: 'container_restart:1',
          kind: 'container_restart',
          status: 'OOMKilled',
          exitCode: 137,
        }),
      ],
      { windowHours: 48 },
    );
    assert.equal(snapshot.nodes[0]?.nodeName, 'node-a');
    assert.equal(snapshot.nodes[0]?.autoscaleCount, 1);
    assert.equal(snapshot.nodes[0]?.memoryCount, 1);
    assert.equal(snapshot.nodes[0]?.avgNodeUsagePct, 92);
    assert.equal(snapshot.nodes[0]?.hitSafetyCapCount, 1);
    const reasons = snapshot.reasons.map((r) => `${r.kind}:${r.value}:${r.count}`);
    assert.ok(reasons.includes('cpu_autoscale:hit_safety_cap:1'));
    assert.ok(reasons.includes('container_restart:OOMKilled:1'));
    assert.equal(snapshot.autoscaleSuccessCount, 0);
  });
});

describe('pickRobustaGenerateExemplars', () => {
  it('does not block generate when the window has more than 20 events', () => {
    assert.equal(robustaGenerateIsBlocked(7260), false);
    assert.equal(robustaGenerateIsBlocked(0), false);
  });

  it('stratifies exemplars by kind instead of taking the newest 20 of one kind', () => {
    const facts: RobustaEventFact[] = [];
    for (let i = 0; i < 40; i += 1) {
      facts.push(
        fact({
          id: `java_oom:${i}`,
          kind: 'java_oom',
          podName: `hot-7d9f8c6b5-${String(i).padStart(5, 'a')}`,
          startedAt: `2026-08-31T12:00:${String(i).padStart(2, '0')}.000Z`,
        }),
      );
    }
    facts.push(
      fact({
        id: 'pod_crash:1',
        kind: 'pod_crash',
        podName: 'hot-7d9f8c6b5-zzzzz',
        status: 'Error',
        startedAt: '2026-08-01T00:00:00.000Z',
      }),
    );
    facts.push(
      fact({
        id: 'cpu_autoscale:1',
        kind: 'cpu_autoscale',
        status: 'scaled',
        startedAt: '2026-08-02T00:00:00.000Z',
      }),
    );
    const picked = pickRobustaGenerateExemplars(facts);
    assert.ok(picked.length <= ROBUSTA_GENERATE_EXEMPLAR_CAP);
    const kinds = new Set(picked.map((row) => row.kind));
    assert.ok(kinds.has('java_oom'));
    assert.ok(kinds.has('pod_crash'), 'low-volume crash must still appear');
    assert.ok(kinds.has('cpu_autoscale'), 'autoscale action must still appear');
    assert.equal(
      picked.some((row) => 'ai_diagnosis' in row || 'heap_summary' in row),
      false,
    );
  });
});

describe('buildRobustaHistoryReportPrompt', () => {
  it('embeds the snapshot and stratified exemplars without Store write-ups or heap dumps', () => {
    const facts = [
      fact({ id: 'java_oom:1', kind: 'java_oom', podName: 'checkout-7d9f8c6b5-aaaaa' }),
      fact({ id: 'cpu_autoscale:1', kind: 'cpu_autoscale', status: 'scaled', nodeName: 'node-a' }),
    ];
    const snapshot = buildRobustaClusterSnapshot(facts, { windowHours: 168 });
    const prompt = buildRobustaHistoryReportPrompt({
      siteTitle: '龍華',
      snapshot,
      exemplars: pickRobustaGenerateExemplars(facts),
    });
    assert.match(prompt, /龍華/);
    assert.match(prompt, /memory_diagnose|java_oom|cpu_autoscale/);
    assert.match(prompt, /重點/);
    assert.match(prompt, /風險/);
    assert.match(prompt, /建議/);
    assert.match(prompt, /詳細資料/);
    assert.match(prompt, /建議提問/);
    const jsonBlock = prompt.slice(prompt.indexOf('```json'));
    assert.doesNotMatch(jsonBlock, /ai_diagnosis/);
    assert.doesNotMatch(jsonBlock, /heap_summary/);
    assert.doesNotMatch(jsonBlock, /thread_dump/);
  });
});

describe('stripRobustaSnapshotForPage', () => {
  it('keeps mix but only the top three workloads for the list strip', () => {
    const facts = Array.from({ length: 6 }, (_, i) =>
      fact({
        id: `java_oom:${i}`,
        kind: 'java_oom',
        namespace: `ns-${i}`,
        podName: `app-${i}`,
      }),
    );
    const snapshot = buildRobustaClusterSnapshot(facts, { windowHours: 24 });
    const strip = stripRobustaSnapshotForPage(snapshot);
    assert.equal(strip.mix.length, 1);
    assert.equal(strip.autoscaleSuccessCount, 0);
    assert.equal(strip.topWorkloads.length, 3);
    assert.equal(snapshot.topWorkloads.length, 6);
  });
});

describe('robustaGenerateActionHint', () => {
  it('blocks Viewer and does not treat a large window as a cap', () => {
    assert.match(
      robustaGenerateActionHint({ canDiagnose: false, total: 100, generating: false }),
      /Viewer/,
    );
    assert.match(
      robustaGenerateActionHint({ canDiagnose: true, total: 0, generating: false }),
      /沒有/,
    );
    assert.match(
      robustaGenerateActionHint({ canDiagnose: true, total: 5000, generating: false }),
      /Snapshot/,
    );
    assert.equal(
      canStartRobustaHistoryGenerate({ canDiagnose: true, total: 5000, generating: false }),
      true,
    );
    assert.equal(
      canStartRobustaHistoryGenerate({ canDiagnose: false, total: 100, generating: false }),
      false,
    );
    assert.equal(
      canStartRobustaHistoryGenerate({ canDiagnose: true, total: 0, generating: false }),
      false,
    );
  });
});

describe('assembleRobustaClusterInsight', () => {
  it('never blocks generate on window volume and caps exemplars', () => {
    const facts = Array.from({ length: 25 }, (_, i) =>
      fact({
        id: `java_oom:${i}`,
        kind: i === 0 ? 'pod_crash' : 'java_oom',
        podName: `app-${i}`,
      }),
    );
    const insight = assembleRobustaClusterInsight(facts, { windowHours: 168 });
    assert.equal(insight.generateBlocked, false);
    assert.equal(insight.snapshot.total, 25);
    assert.ok(insight.exemplars.length <= ROBUSTA_GENERATE_EXEMPLAR_CAP);
    assert.ok(insight.exemplars.some((row) => row.kind === 'pod_crash'));
  });
});

describe('buildRobustaSnapshotApiBody', () => {
  it('returns an empty snapshot when the Site is not deployed', () => {
    const body = buildRobustaSnapshotApiBody({
      deployed: false,
      siteId: '重慶',
      windowHours: 24,
    });
    assert.equal(body.deployed, false);
    assert.equal(body.generateBlocked, false);
    assert.equal(body.snapshot.total, 0);
    assert.deepEqual(body.exemplars, []);
  });

  it('keeps stratified exemplars compact for a covered Site', () => {
    const facts = [
      fact({ id: 'java_oom:1', kind: 'java_oom', podName: 'checkout-7d9f8c6b5-aaaaa' }),
      fact({ id: 'cpu_autoscale:1', kind: 'cpu_autoscale', status: 'scaled' }),
    ];
    const body = buildRobustaSnapshotApiBody({
      deployed: true,
      siteId: '龍華',
      windowHours: 168,
      facts,
    });
    assert.equal(body.deployed, true);
    assert.equal(body.generateBlocked, false);
    assert.ok(body.snapshot.mix.length >= 2);
    assert.equal(body.exemplars.some((row) => 'ai_diagnosis' in row), false);
    assert.deepEqual(
      [...new Set(body.exemplars.map((row) => row.kind))].sort(),
      ['cpu_autoscale', 'java_oom'],
    );
  });

  it('keeps the full snapshot when exemplars are a stratified subset', () => {
    const facts = Array.from({ length: 25 }, (_, i) =>
      fact({
        id: `java_oom:${i}`,
        kind: 'java_oom',
        podName: `app-${i}`,
      }),
    );
    const insight = assembleRobustaClusterInsight(facts, { windowHours: 168 });
    const body = buildRobustaSnapshotApiBody({
      deployed: true,
      siteId: '龍華',
      windowHours: 168,
      snapshot: insight.snapshot,
      exemplars: insight.exemplars,
    });
    assert.equal(body.snapshot.total, 25);
    assert.ok(body.exemplars.length <= ROBUSTA_GENERATE_EXEMPLAR_CAP);
    assert.equal(body.generateBlocked, false);
  });
});
