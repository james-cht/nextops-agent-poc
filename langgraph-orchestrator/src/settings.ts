import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type OrchestratorSettings = {
  employeeId: string;
  model: string;
  updatedAt: string;
};

export type OrchestratorSettingsStore = {
  close(): void;
  get(): OrchestratorSettings;
  seedOnce(seed: { employeeId: string; model: string }): void;
  update(next: { employeeId?: string; model?: string }): OrchestratorSettings;
};

const KEY = 'orchestrator.settings';
const SEEDED_KEY = 'orchestrator.seeded';

export function openOrchestratorSettingsStore(dbPath: string): OrchestratorSettingsStore {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runtime_setting (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  function getMeta(key: string): string | null {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  function setMeta(key: string, value: string): void {
    db.prepare(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(key, value);
  }

  function get(): OrchestratorSettings {
    const row = db.prepare('SELECT value, updated_at FROM runtime_setting WHERE key = ?').get(KEY) as
      | { value: string; updated_at: string }
      | undefined;
    if (!row) {
      return { employeeId: '', model: 'gemini-2.5-flash-lite', updatedAt: new Date(0).toISOString() };
    }
    try {
      const parsed = JSON.parse(row.value) as Partial<OrchestratorSettings>;
      return {
        employeeId: typeof parsed.employeeId === 'string' ? parsed.employeeId : '',
        model: typeof parsed.model === 'string' && parsed.model ? parsed.model : 'gemini-2.5-flash-lite',
        updatedAt: row.updated_at,
      };
    } catch {
      return { employeeId: '', model: 'gemini-2.5-flash-lite', updatedAt: row.updated_at };
    }
  }

  function put(next: { employeeId: string; model: string }): OrchestratorSettings {
    const updatedAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO runtime_setting (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(KEY, JSON.stringify(next), updatedAt);
    return { ...next, updatedAt };
  }

  return {
    close() {
      db.close();
    },
    get,
    seedOnce(seed) {
      if (getMeta(SEEDED_KEY) === '1') return;
      put({ employeeId: seed.employeeId, model: seed.model });
      setMeta(SEEDED_KEY, '1');
    },
    update(next) {
      const cur = get();
      return put({
        employeeId: typeof next.employeeId === 'string' ? next.employeeId.trim() || cur.employeeId : cur.employeeId,
        model: typeof next.model === 'string' ? next.model.trim() || cur.model : cur.model,
      });
    },
  };
}
