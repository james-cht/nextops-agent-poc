import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type ApplicationRecord = {
  name: string;
  gitlabProjectPath: string;
  registeredByUsername: string;
  registeredAt: string;
};

export type RegisterApplicationResult =
  | { ok: true; application: ApplicationRecord }
  | { ok: false; code: 'BAD_REQUEST' | 'CONFLICT'; error: string };

export type UnregisterApplicationResult =
  | { ok: true }
  | { ok: false; code: 'BAD_REQUEST' | 'NOT_FOUND'; error: string };

export type ApplicationStore = {
  close(): void;
  registerApplication(opts: {
    name: string;
    gitlabProjectPath: string;
    registeredByUsername: string;
    now?: Date;
  }): RegisterApplicationResult;
  unregisterApplication(name: string): UnregisterApplicationResult;
  listApplications(): ApplicationRecord[];
  getApplicationByName(name: string): ApplicationRecord | null;
};

function iso(d: Date): string {
  return d.toISOString();
}

function normalizeName(name: string): string {
  return name.trim();
}

function normalizePath(gitlabProjectPath: string): string {
  return gitlabProjectPath.trim().replace(/^\/+|\/+$/g, '');
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS application (
      name TEXT PRIMARY KEY COLLATE NOCASE,
      gitlab_project_path TEXT NOT NULL COLLATE NOCASE UNIQUE,
      registered_by_username TEXT NOT NULL,
      registered_at TEXT NOT NULL
    );
  `);
}

export function openApplicationStore(dbPath: string): ApplicationStore {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  migrate(db);
  let closed = false;

  return {
    close() {
      if (closed) return;
      closed = true;
      db.close();
    },

    registerApplication(opts) {
      const name = normalizeName(opts.name);
      const gitlabProjectPath = normalizePath(opts.gitlabProjectPath);
      const registeredByUsername = opts.registeredByUsername.trim();
      if (!name || !gitlabProjectPath || !registeredByUsername) {
        return {
          ok: false,
          code: 'BAD_REQUEST',
          error: 'Application name, GitLab Project path, and Username are required',
        };
      }
      const clash = db
        .prepare(
          `SELECT name FROM application
           WHERE name = ? COLLATE NOCASE OR gitlab_project_path = ? COLLATE NOCASE`,
        )
        .get(name, gitlabProjectPath) as { name: string } | undefined;
      if (clash) {
        return {
          ok: false,
          code: 'CONFLICT',
          error: 'Application name or GitLab Project path already registered',
        };
      }
      const registeredAt = iso(opts.now ?? new Date());
      db.prepare(
        `INSERT INTO application (name, gitlab_project_path, registered_by_username, registered_at)
         VALUES (?, ?, ?, ?)`,
      ).run(name, gitlabProjectPath, registeredByUsername, registeredAt);
      return {
        ok: true,
        application: { name, gitlabProjectPath, registeredByUsername, registeredAt },
      };
    },

    unregisterApplication(name) {
      const normalized = normalizeName(name);
      if (!normalized) {
        return { ok: false, code: 'BAD_REQUEST', error: 'Application name is required' };
      }
      const existing = db
        .prepare(`SELECT name FROM application WHERE name = ? COLLATE NOCASE`)
        .get(normalized) as { name: string } | undefined;
      if (!existing) {
        return { ok: false, code: 'NOT_FOUND', error: 'Application not found' };
      }
      db.prepare(`DELETE FROM application WHERE name = ? COLLATE NOCASE`).run(normalized);
      return { ok: true };
    },

    listApplications() {
      const rows = db
        .prepare(
          `SELECT name, gitlab_project_path, registered_by_username, registered_at
           FROM application ORDER BY name COLLATE NOCASE ASC`,
        )
        .all() as Array<{
        name: string;
        gitlab_project_path: string;
        registered_by_username: string;
        registered_at: string;
      }>;
      return rows.map((row) => ({
        name: row.name,
        gitlabProjectPath: row.gitlab_project_path,
        registeredByUsername: row.registered_by_username,
        registeredAt: row.registered_at,
      }));
    },

    getApplicationByName(name) {
      const row = db
        .prepare(
          `SELECT name, gitlab_project_path, registered_by_username, registered_at
           FROM application WHERE name = ? COLLATE NOCASE`,
        )
        .get(normalizeName(name)) as
        | {
            name: string;
            gitlab_project_path: string;
            registered_by_username: string;
            registered_at: string;
          }
        | undefined;
      if (!row) return null;
      return {
        name: row.name,
        gitlabProjectPath: row.gitlab_project_path,
        registeredByUsername: row.registered_by_username,
        registeredAt: row.registered_at,
      };
    },
  };
}

const DEFAULT_DB = path.join(process.cwd(), '.data', 'applications.sqlite');

let singleton: ApplicationStore | null = null;

export function getApplicationStore(opts?: { dbPath?: string }): ApplicationStore {
  if (singleton) return singleton;
  singleton = openApplicationStore(opts?.dbPath ?? DEFAULT_DB);
  return singleton;
}

export function _openApplicationStoreForTests(dbPath: string): ApplicationStore {
  _resetApplicationStoreForTests();
  singleton = openApplicationStore(dbPath);
  return singleton;
}

export function _resetApplicationStoreForTests(): void {
  if (singleton) {
    try {
      singleton.close();
    } catch {
      /* */
    }
  }
  singleton = null;
}
