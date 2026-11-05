import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  describeMissingRobustaStoreEnv,
  listMissingRobustaStoreEnv,
} from './robusta-store-env.ts';
import {
  isK8sEventLogSchema,
  parseK8sEventInvestigationId,
  resolveRobustaStoreSchema,
} from './robusta-store-schema.ts';
import {
  buildCountInvestigationsSql,
  buildFetchK8sEventRowSql,
  buildListInvestigationsSql,
  buildListStepsSql,
  buildListEventFactsSql,
  listRobustaEventFacts,
  listRobustaInvestigationSteps,
  listRobustaInvestigations,
} from './robusta-store-query.ts';

describe('missing Robusta Store env', () => {
  it('labels ROBUSTA_DB_NAME as the MySQL database, not a table', () => {
    assert.deepEqual(
      listMissingRobustaStoreEnv({ host: 'db', user: 'u', database: '' }),
      ['ROBUSTA_DB_NAME'],
    );
    assert.equal(
      describeMissingRobustaStoreEnv(['ROBUSTA_DB_NAME']),
      'Robusta Store env is missing ROBUSTA_DB_NAME (MySQL database name, not a table)',
    );
  });

  it('lists every missing key and still explains NAME', () => {
    const missing = listMissingRobustaStoreEnv({ host: '', user: '', database: '' });
    assert.deepEqual(missing, ['ROBUSTA_DB_HOST', 'ROBUSTA_DB_USER', 'ROBUSTA_DB_NAME']);
    assert.match(describeMissingRobustaStoreEnv(missing), /ROBUSTA_DB_NAME \(MySQL database name, not a table\)/);
    assert.equal(listMissingRobustaStoreEnv({ host: 'h', user: 'u', database: 'ai-ops' }).length, 0);
  });
});

describe('robusta store schema SQL', () => {
  it('defaults to the five k8s event-log tables, not investigation', () => {
    const schema = resolveRobustaStoreSchema('');
    assert.equal(isK8sEventLogSchema(schema), true);
    const listSql = buildListInvestigationsSql(schema);
    assert.match(listSql, /`k8s_container_restart_logs`/);
    assert.match(listSql, /`k8s_cpu_resource_resize_logs`/);
    assert.match(listSql, /`k8s_java_oom_logs`/);
    assert.match(listSql, /`k8s_memory_diagnose_logs`/);
    assert.match(listSql, /`k8s_pod_crash_logs`/);
    assert.match(listSql, /`cluster_id`/);
    assert.doesNotMatch(listSql, /`investigation`/);
    assert.doesNotMatch(listSql, /ai-ops/);
    assert.match(buildCountInvestigationsSql(schema), /COUNT\(\*\)/);
  });

  it('does not treat a hyphenated database name as a table', () => {
    const schema = resolveRobustaStoreSchema(
      JSON.stringify({ investigationTable: 'ai-ops', stepTable: 'ok_steps' }),
    );
    assert.equal(isK8sEventLogSchema(schema), false);
    if (isK8sEventLogSchema(schema)) return;
    assert.equal(schema.investigationTable, 'investigation');
    assert.equal(schema.stepTable, 'ok_steps');
    const sql = buildListInvestigationsSql(schema);
    assert.match(sql, /FROM `investigation` i/);
    assert.doesNotMatch(sql, /ai-ops/);
  });

  it('keeps investigation_step SQL when that mode is requested', () => {
    const schema = resolveRobustaStoreSchema(
      JSON.stringify({
        mode: 'investigation_step',
        investigationTable: 'investigation',
        stepTable: 'investigation_step',
      }),
    );
    const listSql = buildListInvestigationsSql(schema);
    assert.match(listSql, /`investigation`/);
    assert.match(listSql, /`cluster`/);
    assert.match(buildListStepsSql(schema), /`investigation_step`/);
  });

  it('ignores unsafe ident overrides in investigation_step mode', () => {
    const schema = resolveRobustaStoreSchema(
      JSON.stringify({ investigationTable: 'inv;drop', stepTable: 'ok_steps' }),
    );
    assert.equal(isK8sEventLogSchema(schema), false);
    if (isK8sEventLogSchema(schema)) return;
    assert.equal(schema.investigationTable, 'investigation');
    assert.equal(schema.stepTable, 'ok_steps');
  });
});

describe('k8s event investigation ids', () => {
  it('parses kind:id against the default sources', () => {
    const schema = resolveRobustaStoreSchema('');
    assert.equal(isK8sEventLogSchema(schema), true);
    if (!isK8sEventLogSchema(schema)) return;
    const parsed = parseK8sEventInvestigationId('java_oom:42', schema);
    assert.equal(parsed?.source.table, 'k8s_java_oom_logs');
    assert.equal(parsed?.id, '42');
    assert.equal(parseK8sEventInvestigationId('unknown:1', schema), null);
    assert.equal(parseK8sEventInvestigationId('java_oom:nope', schema), null);
  });
});

describe('listRobustaInvestigations mapping', () => {
  it('maps rows and paginates via LIMIT/OFFSET params', async () => {
    const schema = resolveRobustaStoreSchema(
      JSON.stringify({ mode: 'investigation_step', investigationTable: 'investigation' }),
    );
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const queryFn = async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (/\bAS total\b/i.test(sql)) return [{ total: 51 }];
      return [
        {
          id: 9,
          title: 'OOM',
          status: 'success',
          started_at: '2026-08-01T00:00:00.000Z',
          step_count: 3,
        },
      ];
    };
    const result = await listRobustaInvestigations(
      { clusterKey: 'lh-k8s-cluster', windowHours: 168, page: 2, pageSize: 50, schema },
      queryFn,
    );
    assert.equal(result.total, 51);
    assert.equal(result.items[0].id, '9');
    assert.equal(result.items[0].title, 'OOM');
    assert.equal(result.items[0].stepCount, 3);
    assert.equal(calls[1].params[2], 50);
    assert.equal(calls[1].params[3], 50);
  });

  it('repeats cluster and window params once per k8s event table', async () => {
    const schema = resolveRobustaStoreSchema('');
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const queryFn = async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (/\bAS total\b/i.test(sql)) return [{ total: 2 }];
      return [
        {
          id: 'java_oom:9',
          title: 'JavaOOM · ns · pod',
          status: '',
          started_at: '2026-08-01T00:00:00.000Z',
          step_count: 1,
        },
      ];
    };
    const result = await listRobustaInvestigations(
      { clusterKey: 'lh-k8s-cluster', windowHours: 168, page: 1, pageSize: 50, schema },
      queryFn,
    );
    assert.equal(result.items[0].id, 'java_oom:9');
    assert.equal(calls[0].params.length, 10);
    assert.equal(calls[1].params.length, 12);
    assert.equal(calls[1].params[10], 50);
    assert.equal(calls[1].params[11], 0);
  });

  it('queries only the filtered k8s kind and Autoscale Success status', async () => {
    const schema = resolveRobustaStoreSchema('');
    const podSql = buildListInvestigationsSql(schema, { kind: 'pod_crash', cpuSuccess: false });
    assert.match(podSql, /`k8s_pod_crash_logs`/);
    assert.doesNotMatch(podSql, /`k8s_java_oom_logs`/);
    const successSql = buildListInvestigationsSql(schema, {
      kind: 'cpu_autoscale',
      cpuSuccess: true,
    });
    assert.match(successSql, /`k8s_cpu_resource_resize_logs`/);
    assert.match(successSql, /`scale_status`/);
    assert.match(successSql, / = \?/);
    const calls: unknown[][] = [];
    const queryFn = async (sql: string, params: unknown[]) => {
      calls.push(params);
      if (/\bAS total\b/i.test(sql)) return [{ total: 1 }];
      return [];
    };
    await listRobustaInvestigations(
      {
        clusterKey: 'lh',
        windowHours: 24,
        page: 1,
        schema,
        kindFilter: { kind: 'cpu_autoscale', cpuSuccess: true },
      },
      queryFn,
    );
    assert.deepEqual(calls[0], ['lh', 24, 'scaled']);
  });

  it('returns no rows for a Kind Filter on investigation_step schema', async () => {
    const schema = resolveRobustaStoreSchema(
      JSON.stringify({ mode: 'investigation_step', investigationTable: 'investigation' }),
    );
    const result = await listRobustaInvestigations(
      {
        clusterKey: 'lh',
        windowHours: 24,
        page: 1,
        schema,
        kindFilter: { kind: 'pod_crash', cpuSuccess: false },
      },
      async () => {
        throw new Error('should not query');
      },
    );
    assert.deepEqual(result, { total: 0, items: [] });
  });
});

describe('listRobustaInvestigationSteps mapping', () => {
  it('maps Store outcome and time from an investigation_step table', async () => {
    const schema = resolveRobustaStoreSchema(
      JSON.stringify({ mode: 'investigation_step', investigationTable: 'investigation' }),
    );
    const queryFn = async () => [
      { name: 'kubectl_logs', outcome: 'ok', occurred_at: '2026-08-01T00:01:00.000Z' },
    ];
    const steps = await listRobustaInvestigationSteps(
      { investigationId: '9', clusterKey: 'lh-k8s-cluster', schema },
      queryFn,
    );
    assert.equal(steps[0].name, 'kubectl_logs');
    assert.equal(steps[0].outcome, 'ok');
    assert.ok(steps[0].occurredAt);
  });

  it('projects compact diagnosis columns from a k8s event-log row', async () => {
    const schema = resolveRobustaStoreSchema('');
    assert.equal(isK8sEventLogSchema(schema), true);
    if (!isK8sEventLogSchema(schema)) return;
    const java = schema.sources.find((s) => s.kind === 'java_oom');
    assert.ok(java);
    const sql = buildFetchK8sEventRowSql(java);
    assert.match(sql, /`k8s_java_oom_logs`/);
    assert.doesNotMatch(sql, /heap_summary/);
    const queryFn = async () => [
      { id: 9, cluster_id: 'lh-k8s-cluster', created_at: '2026-08-01T00:01:00.000Z', ai_diagnosis: ' heap OOM ' },
    ];
    const steps = await listRobustaInvestigationSteps(
      { investigationId: 'java_oom:9', clusterKey: 'lh-k8s-cluster', schema },
      queryFn,
    );
    assert.equal(steps.length, 1);
    assert.equal(steps[0].name, 'ai_diagnosis');
    assert.equal(steps[0].outcome, 'heap OOM');
  });
});

describe('listRobustaEventFacts', () => {
  it('selects compact cluster-insight columns and omits diagnosis and heap blobs', () => {
    const schema = resolveRobustaStoreSchema('');
    const sql = buildListEventFactsSql(schema);
    assert.match(sql, /`k8s_memory_diagnose_logs`/);
    assert.match(sql, /`k8s_cpu_resource_resize_logs`/);
    assert.match(sql, /`cluster_id`/);
    assert.doesNotMatch(sql, /ai_diagnosis/);
    assert.doesNotMatch(sql, /heap_summary/);
    assert.doesNotMatch(sql, /thread_dump/);
    assert.doesNotMatch(sql, /app_logs/);
  });

  it('maps fact rows and returns none for investigation_step schema', async () => {
    const k8s = resolveRobustaStoreSchema('');
    const queryFn = async () => [
      {
        id: 'java_oom:1',
        kind: 'java_oom',
        namespace: 'prod',
        pod_name: 'api-7d9f8c6b5-aaaaa',
        container_name: 'api',
        node_name: '',
        status: '',
        started_at: '2026-08-31T00:00:00.000Z',
        restart_count: null,
        exit_code: null,
        node_usage_pct: null,
        safety_max_limit_m: null,
        mem_increase_1h: '',
        mem_usage: '',
        mem_limit: '',
        node_allocatable: '',
        node_real_usage: '',
      },
    ];
    const facts = await listRobustaEventFacts(
      { clusterKey: 'lh-k8s-cluster', windowHours: 168, schema: k8s },
      queryFn,
    );
    assert.equal(facts[0]?.kind, 'java_oom');
    assert.equal(facts[0]?.podName, 'api-7d9f8c6b5-aaaaa');
    const legacy = resolveRobustaStoreSchema(
      JSON.stringify({ mode: 'investigation_step', investigationTable: 'investigation' }),
    );
    const none = await listRobustaEventFacts(
      { clusterKey: 'lh', windowHours: 24, schema: legacy },
      async () => {
        throw new Error('should not query');
      },
    );
    assert.deepEqual(none, []);
  });
});
