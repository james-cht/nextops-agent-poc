/** Cluster Operations Snapshot + generate corpus for Robusta History (k8s event-log Store). */

import { SUGGESTION_MARKER } from './bounded-log-analysis.ts';
import { APPENDIX_MARKER } from './diagnosis-answer-view.ts';
import { GENERATE_HINT_TEXT } from './robusta-history.ts';

export const ROBUSTA_ACTION_KINDS = ['cpu_autoscale'] as const;
export const ROBUSTA_SNAPSHOT_STRIP_WORKLOADS = 3;
export const ROBUSTA_GENERATE_EXEMPLAR_CAP = 20;

const DEPLOYMENT_POD =
  /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)-[a-z0-9]{8,10}-[a-z0-9]{5}$/i;

export function robustaWorkloadKey(podName: string): string {
  const name = podName.trim();
  const match = DEPLOYMENT_POD.exec(name);
  return match ? match[1] : name;
}

export function isRobustaActionKind(kind: string): boolean {
  return (ROBUSTA_ACTION_KINDS as readonly string[]).includes(kind);
}

export interface RobustaEventFact {
  id: string;
  kind: string;
  namespace: string;
  podName: string;
  containerName: string;
  nodeName: string;
  status: string;
  startedAt: string | null;
  restartCount?: number | null;
  exitCode?: number | null;
  nodeUsagePct?: number | null;
  safetyMaxLimitM?: number | null;
  memIncrease1h?: string;
  memUsage?: string;
  memLimit?: string;
  nodeAllocatable?: string;
  nodeRealUsage?: string;
}

export interface RobustaMixRow {
  kind: string;
  count: number;
  distinctPods: number;
  distinctNamespaces: number;
  isAction: boolean;
}

export interface RobustaClusterSnapshot {
  total: number;
  windowHours: number;
  mix: RobustaMixRow[];
  autoscaleSuccessCount: number;
  topWorkloads: RobustaWorkloadRank[];
  nodes: RobustaNodeRank[];
  reasons: RobustaReasonRank[];
  crossKind: RobustaCrossKindRow[];
}

export interface RobustaWorkloadRank {
  namespace: string;
  workloadKey: string;
  count: number;
  kinds: string[];
}

export interface RobustaNodeRank {
  nodeName: string;
  autoscaleCount: number;
  memoryCount: number;
  avgNodeUsagePct: number | null;
  hitSafetyCapCount: number;
}

export interface RobustaReasonRank {
  kind: string;
  value: string;
  count: number;
}

export interface RobustaCrossKindRow {
  namespace: string;
  workloadKey: string;
  kinds: string[];
  count: number;
}

export function buildRobustaClusterSnapshot(
  facts: readonly RobustaEventFact[],
  opts: { windowHours: number },
): RobustaClusterSnapshot {
  const mixMap = new Map<string, { count: number; pods: Set<string>; nss: Set<string> }>();
  for (const fact of facts) {
    const row = mixMap.get(fact.kind) ?? { count: 0, pods: new Set(), nss: new Set() };
    row.count += 1;
    if (fact.podName) row.pods.add(`${fact.namespace}/${fact.podName}`);
    if (fact.namespace) row.nss.add(fact.namespace);
    mixMap.set(fact.kind, row);
  }
  const mix = [...mixMap.entries()]
    .map(([kind, row]) => ({
      kind,
      count: row.count,
      distinctPods: row.pods.size,
      distinctNamespaces: row.nss.size,
      isAction: isRobustaActionKind(kind),
    }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));

  const workloadMap = new Map<string, { count: number; kinds: Set<string> }>();
  for (const fact of facts) {
    const workloadKey = robustaWorkloadKey(fact.podName);
    const key = `${fact.namespace}\0${workloadKey}`;
    const row = workloadMap.get(key) ?? { count: 0, kinds: new Set() };
    row.count += 1;
    row.kinds.add(fact.kind);
    workloadMap.set(key, row);
  }
  const topWorkloads = [...workloadMap.entries()]
    .map(([key, row]) => {
      const [namespace, workloadKey] = key.split('\0');
      return {
        namespace,
        workloadKey,
        count: row.count,
        kinds: [...row.kinds].sort(),
      };
    })
    .sort((a, b) => b.count - a.count || a.workloadKey.localeCompare(b.workloadKey));

  const crossKind = topWorkloads.filter((row) => row.kinds.length >= 2);

  const nodeMap = new Map<
    string,
    { autoscale: number; memory: number; usageSum: number; usageN: number; safety: number }
  >();
  for (const fact of facts) {
    const nodeName = fact.nodeName.trim();
    if (!nodeName) continue;
    const row = nodeMap.get(nodeName) ?? {
      autoscale: 0,
      memory: 0,
      usageSum: 0,
      usageN: 0,
      safety: 0,
    };
    if (fact.kind === 'cpu_autoscale') row.autoscale += 1;
    if (fact.kind === 'memory_diagnose') row.memory += 1;
    if (typeof fact.nodeUsagePct === 'number' && Number.isFinite(fact.nodeUsagePct)) {
      row.usageSum += fact.nodeUsagePct;
      row.usageN += 1;
    }
    if (/safety/i.test(fact.status)) row.safety += 1;
    nodeMap.set(nodeName, row);
  }
  const nodes = [...nodeMap.entries()]
    .map(([nodeName, row]) => ({
      nodeName,
      autoscaleCount: row.autoscale,
      memoryCount: row.memory,
      avgNodeUsagePct: row.usageN ? row.usageSum / row.usageN : null,
      hitSafetyCapCount: row.safety,
    }))
    .sort(
      (a, b) =>
        b.autoscaleCount + b.memoryCount - (a.autoscaleCount + a.memoryCount) ||
        a.nodeName.localeCompare(b.nodeName),
    );

  const reasonMap = new Map<string, number>();
  for (const fact of facts) {
    const value = fact.status.trim();
    if (!value) continue;
    const key = `${fact.kind}\0${value}`;
    reasonMap.set(key, (reasonMap.get(key) ?? 0) + 1);
  }
  const reasons = [...reasonMap.entries()]
    .map(([key, count]) => {
      const [kind, value] = key.split('\0');
      return { kind, value, count };
    })
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));

  return {
    total: facts.length,
    windowHours: opts.windowHours,
    mix,
    autoscaleSuccessCount: facts.filter(
      (fact) => fact.kind === 'cpu_autoscale' && fact.status.trim() === 'scaled',
    ).length,
    topWorkloads,
    nodes,
    reasons,
    crossKind,
  };
}

export function robustaGenerateIsBlocked(_eventCount: number): boolean {
  return false;
}

export function robustaGenerateActionHint(opts: {
  canDiagnose: boolean;
  total: number;
  generating: boolean;
}): string {
  if (!opts.canDiagnose) {
    return '目前角色為 Viewer，無法生成調查建議報告。';
  }
  if (opts.generating) {
    return '正在依 Cluster Operations Snapshot 生成調查建議報告…';
  }
  if (opts.total <= 0) {
    return '此時間窗沒有事件，無法生成調查建議報告。';
  }
  return GENERATE_HINT_TEXT;
}

export function canStartRobustaHistoryGenerate(opts: {
  canDiagnose: boolean;
  total: number;
  generating: boolean;
}): boolean {
  return opts.canDiagnose && opts.total > 0 && !opts.generating;
}

export function assembleRobustaClusterInsight(
  facts: readonly RobustaEventFact[],
  opts: { windowHours: number },
): {
  snapshot: RobustaClusterSnapshot;
  exemplars: RobustaEventFact[];
  generateBlocked: boolean;
} {
  const snapshot = buildRobustaClusterSnapshot(facts, opts);
  return {
    snapshot,
    exemplars: pickRobustaGenerateExemplars(facts),
    generateBlocked: robustaGenerateIsBlocked(facts.length),
  };
}

export function buildRobustaSnapshotApiBody(opts: {
  deployed: boolean;
  siteId: string;
  windowHours: number;
  facts?: readonly RobustaEventFact[];
  snapshot?: RobustaClusterSnapshot;
  exemplars?: readonly RobustaEventFact[];
}): {
  deployed: boolean;
  siteId: string;
  windowHours: number;
  generateBlocked: boolean;
  snapshot: RobustaClusterSnapshot;
  exemplars: RobustaEventFact[];
} {
  const insight =
    opts.snapshot != null
      ? {
          snapshot: opts.snapshot,
          exemplars: [...(opts.exemplars ?? [])],
          generateBlocked: robustaGenerateIsBlocked(opts.snapshot.total),
        }
      : assembleRobustaClusterInsight(opts.facts ?? [], { windowHours: opts.windowHours });
  return {
    deployed: opts.deployed,
    siteId: opts.siteId,
    windowHours: opts.windowHours,
    generateBlocked: insight.generateBlocked,
    snapshot: insight.snapshot,
    exemplars: insight.exemplars,
  };
}

function workloadCountKey(fact: RobustaEventFact): string {
  return `${fact.namespace}\0${robustaWorkloadKey(fact.podName)}`;
}

export function pickRobustaGenerateExemplars(
  facts: readonly RobustaEventFact[],
  cap = ROBUSTA_GENERATE_EXEMPLAR_CAP,
): RobustaEventFact[] {
  if (facts.length === 0 || cap <= 0) return [];
  const byKind = new Map<string, RobustaEventFact[]>();
  const workloadCounts = new Map<string, number>();
  for (const fact of facts) {
    const list = byKind.get(fact.kind) ?? [];
    list.push(fact);
    byKind.set(fact.kind, list);
    const wk = workloadCountKey(fact);
    workloadCounts.set(wk, (workloadCounts.get(wk) ?? 0) + 1);
  }
  const kinds = [...byKind.keys()].sort((a, b) => {
    const volume = (byKind.get(b)?.length ?? 0) - (byKind.get(a)?.length ?? 0);
    if (volume !== 0) return volume;
    return a.localeCompare(b);
  });
  const quota = new Map<string, number>();
  let remaining = cap;
  for (const kind of kinds) {
    if (remaining <= 0) break;
    quota.set(kind, 1);
    remaining -= 1;
  }
  let cursor = 0;
  while (remaining > 0 && kinds.length > 0) {
    const kind = kinds[cursor % kinds.length];
    quota.set(kind, (quota.get(kind) ?? 0) + 1);
    remaining -= 1;
    cursor += 1;
  }

  function score(fact: RobustaEventFact): number {
    const repeats = workloadCounts.get(workloadCountKey(fact)) ?? 0;
    const ts = Date.parse(fact.startedAt ?? '') || 0;
    return repeats * 1e15 + ts;
  }

  const picked: RobustaEventFact[] = [];
  for (const kind of kinds) {
    const take = quota.get(kind) ?? 0;
    if (take <= 0) continue;
    const ranked = [...(byKind.get(kind) ?? [])].sort((a, b) => score(b) - score(a));
    picked.push(...ranked.slice(0, take));
  }
  return picked.slice(0, cap);
}

export function compactRobustaExemplar(fact: RobustaEventFact): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: fact.id,
    kind: fact.kind,
    namespace: fact.namespace,
    workloadKey: robustaWorkloadKey(fact.podName),
    podName: fact.podName,
    status: fact.status,
    startedAt: fact.startedAt,
  };
  if (fact.containerName) out.containerName = fact.containerName;
  if (fact.nodeName) out.nodeName = fact.nodeName;
  if (fact.restartCount != null) out.restartCount = fact.restartCount;
  if (fact.exitCode != null) out.exitCode = fact.exitCode;
  if (fact.nodeUsagePct != null) out.nodeUsagePct = fact.nodeUsagePct;
  if (fact.safetyMaxLimitM != null) out.safetyMaxLimitM = fact.safetyMaxLimitM;
  if (fact.memIncrease1h) out.memIncrease1h = fact.memIncrease1h;
  if (fact.memUsage) out.memUsage = fact.memUsage;
  if (fact.memLimit) out.memLimit = fact.memLimit;
  if (fact.nodeAllocatable) out.nodeAllocatable = fact.nodeAllocatable;
  if (fact.nodeRealUsage) out.nodeRealUsage = fact.nodeRealUsage;
  return out;
}

export function stripRobustaSnapshotForPage(snapshot: RobustaClusterSnapshot): {
  total: number;
  windowHours: number;
  mix: RobustaMixRow[];
  autoscaleSuccessCount: number;
  topWorkloads: RobustaWorkloadRank[];
} {
  return {
    total: snapshot.total,
    windowHours: snapshot.windowHours,
    mix: snapshot.mix,
    autoscaleSuccessCount: snapshot.autoscaleSuccessCount,
    topWorkloads: snapshot.topWorkloads.slice(0, ROBUSTA_SNAPSHOT_STRIP_WORKLOADS),
  };
}

export function buildRobustaHistoryReportPrompt(opts: {
  siteTitle: string;
  snapshot: RobustaClusterSnapshot;
  exemplars: readonly RobustaEventFact[];
}): string {
  const label = opts.siteTitle.trim() || '未知站點';
  const corpus = {
    snapshot: {
      total: opts.snapshot.total,
      windowHours: opts.snapshot.windowHours,
      mix: opts.snapshot.mix,
      autoscaleSuccessCount: opts.snapshot.autoscaleSuccessCount,
      topWorkloads: opts.snapshot.topWorkloads.slice(0, 10),
      nodes: opts.snapshot.nodes.slice(0, 10),
      reasons: opts.snapshot.reasons.slice(0, 12),
      crossKind: opts.snapshot.crossKind.slice(0, 10),
    },
    exemplars: opts.exemplars.map(compactRobustaExemplar),
  };
  return [
    `請根據站點「${label}」在 Robusta History Window（${opts.snapshot.windowHours} 小時）內的 Cluster Operations Snapshot 與分層 exemplar，撰寫一份集群操作洞見報告。`,
    '這是 NextOps 聚合後的精簡投影，不是 Robusta 已寫入的調查原文。不要複述調查原文，也不要引用 heap / thread / app 日誌欄位。',
    'cpu_autoscale 是處置動作，不是故障；status 請沿用 Store 原值，不要改寫成 Pipeline 狀態。',
    '用繁體中文。先寫視覺摘要：用 markdown 標題分段，用表格列出 mix / 熱點 workload / node，並用獨立行「重點：」「風險：」「建議：」寫短句。不要用 **粗體** 當標題。',
    `然後另起一行，標題恰好為「${APPENDIX_MARKER}」，其後才寫較長說明。`,
    `文末請用獨立標題「${SUGGESTION_MARKER}」，其後每行一條可追問的問題。`,
    '',
    '```json',
    JSON.stringify(corpus, null, 2),
    '```',
  ].join('\n');
}


