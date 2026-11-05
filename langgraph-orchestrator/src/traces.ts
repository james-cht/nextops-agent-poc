import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { TraceUsage } from './usage.ts';

export const TRACE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type TraceObservationKind = 'tool_endpoint' | 'context_reduction' | 'aibridge_gateway';

export type TraceObservation = {
  kind: TraceObservationKind;
  name: string;
  truncated: boolean;
  payload: Record<string, unknown>;
  startedAt: string;
  endedAt: string;
  status?: number;
  error?: string;
};

export type DiagnosisTrace = {
  id: string;
  conversationId: string;
  siteId: string;
  operatorUsername: string | null;
  query: string;
  error: string;
  answer: string;
  model: string;
  usage: TraceUsage;
  observations: TraceObservation[];
  createdAt: string;
};

export type TraceSummary = {
  id: string;
  conversationId: string;
  siteId: string;
  operatorUsername: string | null;
  query: string;
  error: string;
  model: string;
  usage: TraceUsage;
  observationCount: number;
  createdAt: string;
};

export type TraceStore = {
  close(): void;
  put(trace: DiagnosisTrace): void;
  get(id: string): DiagnosisTrace | null;
  list(opts?: { limit?: number; now?: Date }): TraceSummary[];
  prune(now?: Date): void;
};

function asTrace(row: {
  id: string;
  conversation_id: string;
  site_id: string;
  operator_username: string;
  query: string;
  error: string;
  answer: string;
  model: string;
  usage_json: string;
  observations_json: string;
  created_at: string;
}): DiagnosisTrace {
  let usage: TraceUsage = { inputTokens: 0, outputTokens: 0, usd: 0, source: 'estimated' };
  try {
    usage = JSON.parse(row.usage_json) as TraceUsage;
  } catch {
    /* keep default */
  }
  let observations: TraceObservation[] = [];
  try {
    const parsed = JSON.parse(row.observations_json) as TraceObservation[];
    if (Array.isArray(parsed)) observations = parsed;
  } catch {
    observations = [];
  }
  return {
    id: row.id,
    conversationId: row.conversation_id,
    siteId: row.site_id,
    operatorUsername: row.operator_username || null,
    query: row.query,
    error: row.error,
    answer: row.answer,
    model: row.model,
    usage,
    observations,
    createdAt: row.created_at,
  };
}

export function openTraceStore(dbPath: string): TraceStore {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS diagnosis_trace (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      operator_username TEXT NOT NULL,
      query TEXT NOT NULL,
      error TEXT NOT NULL,
      answer TEXT NOT NULL,
      model TEXT NOT NULL,
      usage_json TEXT NOT NULL,
      observations_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_diagnosis_trace_created ON diagnosis_trace (created_at);
  `);

  const store: TraceStore = {
    close() {
      db.close();
    },

    put(trace) {
      db.prepare(
        `INSERT INTO diagnosis_trace (
            id, conversation_id, site_id, operator_username, query, error, answer, model,
            usage_json, observations_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            conversation_id = excluded.conversation_id,
            site_id = excluded.site_id,
            operator_username = excluded.operator_username,
            query = excluded.query,
            error = excluded.error,
            answer = excluded.answer,
            model = excluded.model,
            usage_json = excluded.usage_json,
            observations_json = excluded.observations_json,
            created_at = excluded.created_at`,
      ).run(
        trace.id,
        trace.conversationId,
        trace.siteId,
        trace.operatorUsername ?? '',
        trace.query,
        trace.error,
        trace.answer,
        trace.model,
        JSON.stringify(trace.usage),
        JSON.stringify(trace.observations),
        trace.createdAt,
      );
      store.prune();
    },

    get(id) {
      const row = db
        .prepare(
          `SELECT id, conversation_id, site_id, operator_username, query, error, answer, model,
                  usage_json, observations_json, created_at
             FROM diagnosis_trace WHERE id = ?`,
        )
        .get(id) as
        | {
            id: string;
            conversation_id: string;
            site_id: string;
            operator_username: string;
            query: string;
            error: string;
            answer: string;
            model: string;
            usage_json: string;
            observations_json: string;
            created_at: string;
          }
        | undefined;
      return row ? asTrace(row) : null;
    },

    list(opts = {}) {
      const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
      const cutoff = new Date((opts.now ?? new Date()).getTime() - TRACE_RETENTION_MS).toISOString();
      const rows = db
        .prepare(
          `SELECT id, conversation_id, site_id, operator_username, query, error, answer, model,
                  usage_json, observations_json, created_at
             FROM diagnosis_trace
            WHERE created_at >= ?
            ORDER BY created_at DESC
            LIMIT ?`,
        )
        .all(cutoff, limit) as Array<{
        id: string;
        conversation_id: string;
        site_id: string;
        operator_username: string;
        query: string;
        error: string;
        answer: string;
        model: string;
        usage_json: string;
        observations_json: string;
        created_at: string;
      }>;
      return rows.map((row) => {
        const full = asTrace(row);
        return {
          id: full.id,
          conversationId: full.conversationId,
          siteId: full.siteId,
          operatorUsername: full.operatorUsername,
          query: full.query.slice(0, 240),
          error: full.error,
          model: full.model,
          usage: full.usage,
          observationCount: full.observations.length,
          createdAt: full.createdAt,
        };
      });
    },

    prune(now = new Date()) {
      const cutoff = new Date(now.getTime() - TRACE_RETENTION_MS).toISOString();
      db.prepare('DELETE FROM diagnosis_trace WHERE created_at < ?').run(cutoff);
    },
  };

  return store;
}
