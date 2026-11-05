import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const MAX_TURNS = 20;
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type ConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type ConversationRecord = {
  id: string;
  siteId: string;
  summary: string;
  turns: ConversationTurn[];
  updatedAt: string;
};

export type ConversationStore = {
  close(): void;
  get(id: string): ConversationRecord | null;
  put(record: ConversationRecord): void;
  delete(id: string): void;
  prune(now?: Date): void;
};

export function openConversationStore(dbPath: string): ConversationStore {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS diagnosis_conversation (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      turns_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const store: ConversationStore = {
    close() {
      db.close();
    },

    get(id) {
      const row = db
        .prepare(
          'SELECT id, site_id, summary, turns_json, updated_at FROM diagnosis_conversation WHERE id = ?',
        )
        .get(id) as
        | { id: string; site_id: string; summary: string; turns_json: string; updated_at: string }
        | undefined;
      if (!row) return null;
      let turns: ConversationTurn[] = [];
      try {
        const parsed = JSON.parse(row.turns_json) as ConversationTurn[];
        if (Array.isArray(parsed)) turns = parsed;
      } catch {
        turns = [];
      }
      return {
        id: row.id,
        siteId: row.site_id,
        summary: row.summary,
        turns,
        updatedAt: row.updated_at,
      };
    },

    put(record) {
      const turns = record.turns.slice(-MAX_TURNS);
      db.prepare(
        `INSERT INTO diagnosis_conversation (id, site_id, summary, turns_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           site_id = excluded.site_id,
           summary = excluded.summary,
           turns_json = excluded.turns_json,
           updated_at = excluded.updated_at`,
      ).run(record.id, record.siteId, record.summary, JSON.stringify(turns), record.updatedAt);
    },

    delete(id) {
      db.prepare('DELETE FROM diagnosis_conversation WHERE id = ?').run(id);
    },

    prune(now = new Date()) {
      const cutoff = new Date(now.getTime() - RETENTION_MS).toISOString();
      db.prepare('DELETE FROM diagnosis_conversation WHERE updated_at < ?').run(cutoff);
    },
  };

  return store;
}

export function summarizeTurns(turns: ConversationTurn[]): string {
  const recent = turns.slice(-6);
  return recent
    .map((t) => `${t.role === 'user' ? '操作員' : '助手'}: ${t.content.slice(0, 400)}`)
    .join('\n');
}
