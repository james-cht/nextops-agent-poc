import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { StoredLogCategory } from '../log-category-seeds.ts';
import { seedLogCategories } from '../log-category-seeds.ts';
import type { LivePodOccupancyKey } from '../live-pod-diagnostics.ts';
import { hashAdminPassword, verifyAdminPassword } from '../admin-password.ts';
import { verifyTotp } from './totp.ts';
import type { DifyCredentialValues } from '../dify-credentials-policy.ts';
import type {
  GitLabOAuthClientValues,
  GitLabReadAccessValues,
} from '../gitlab-settings-policy.ts';
import type { GitLabAccessRecord } from './gitlab-access.ts';
import type { ConfigAuditEntry, ConfigAuditOutcome } from './config-audit-log.ts';
import type { ModelRateTable } from '../model-rate-table.ts';
import { parseModelRateTable } from '../model-rate-table.ts';
import { parseReleaseVersion } from '../release-notes.ts';
import { isOperatorRole, type OperatorRole } from '../operator-role.ts';
import { normalizeOperatorDisplayName } from '../operator-display-name.ts';

export type { OperatorRole };
export type { GitLabAccessRecord };

export type CreateOperatorResult =
  | { ok: true; temporaryPassword: string }
  | { ok: false; code: 'FORBIDDEN' | 'CONFLICT' | 'BAD_REQUEST'; error: string };

export type DisableOperatorResult =
  | { ok: true }
  | { ok: false; code: 'FORBIDDEN' | 'BAD_REQUEST'; error: string };

export type MutateOperatorResult =
  | { ok: true }
  | { ok: false; code: 'FORBIDDEN' | 'BAD_REQUEST' | 'CONFLICT' | 'UNAUTHORIZED'; error: string };

export type ResetOperatorPasswordResult =
  | { ok: true; temporaryPassword: string }
  | { ok: false; code: 'FORBIDDEN' | 'BAD_REQUEST'; error: string };

export type OperatorAccountRecord = {
  username: string;
  email: string;
  /** Null for legacy / env-seeded accounts until a Platform Owner fills it. */
  displayName: string | null;
  role: OperatorRole;
  disabled: boolean;
  secondFactorEnrolled: boolean;
};

export type OperatorSessionRecord = {
  id: string;
  username: string;
  clientIp: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
};

export type LoginEventOutcome = 'success' | 'failure' | 'lockout' | 'unlock';

export type LoginEventRecord = {
  username: string;
  outcome: LoginEventOutcome;
  clientIp: string;
  at: string;
};

export type SmartLoggingPrefs = {
  watchlist: string[];
  activeIndex: string | null;
  categories: StoredLogCategory[];
  /** True when no row existed — categories are in-memory seeds until first save. */
  seeded: boolean;
};

export type SmartLoggingPrefsInput = {
  watchlist: string[];
  activeIndex: string | null;
  categories: StoredLogCategory[];
};

export type LivePodOccupancyRecord = LivePodOccupancyKey & {
  taskId: string;
  inFlight: boolean;
};

export type BeginLivePodOccupancyResult =
  | { ok: true }
  | { ok: false; code: 'IN_FLIGHT' };

export type LocalSettingsStore = {
  close(): void;
  seedAdminIfEmpty(opts: { username: string; password: string }): Promise<boolean>;
  verifyAdmin(username: string, password: string): Promise<boolean>;
  changeAdmin(opts: {
    currentPassword: string;
    newUsername: string;
    newPassword: string;
  }): Promise<ChangeAdminResult>;
  getAdminUsername(): string | null;
  getDifyOverride(): DifyCredentialValues | null;
  setDifyOverride(values: DifyCredentialValues): void;
  clearDifyOverride(): void;
  getMysqlProxyEnabled(): boolean | null;
  setMysqlProxyEnabled(enabled: boolean): void;
  getModelRateTable(): ModelRateTable | null;
  setModelRateTable(table: ModelRateTable): void;
  getGitLabOAuthClient(): GitLabOAuthClientValues | null;
  setGitLabOAuthClient(values: GitLabOAuthClientValues): void;
  clearGitLabOAuthClient(): void;
  getGitLabReadAccess(): GitLabReadAccessValues | null;
  setGitLabReadAccess(values: GitLabReadAccessValues): void;
  clearGitLabReadAccess(): void;
  getGitLabAccess(username: string): GitLabAccessRecord | null;
  setGitLabAccess(opts: {
    username: string;
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: string | null;
    now?: Date;
  }): void;
  clearGitLabAccess(username: string): void;
  putGitLabOAuthPending(opts: { state: string; username: string; expiresAt: string }): void;
  takeGitLabOAuthPending(state: string, now?: Date): { username: string } | null;
  appendAudit(entry: Omit<ConfigAuditEntry, 'ts'> & { ts?: string }): ConfigAuditEntry;
  listAudit(limit?: number): ConfigAuditEntry[];
  /** Import legacy `.data` JSON files once; returns whether import ran. */
  importLegacyDataDir(dataDir: string): boolean;
  getSmartLoggingPrefs(operatorKey: string, siteId: string): SmartLoggingPrefs;
  putSmartLoggingPrefs(operatorKey: string, siteId: string, prefs: SmartLoggingPrefsInput): void;
  getReleaseNotesLastRead(operatorKey: string): string | null;
  putReleaseNotesLastRead(operatorKey: string, version: string): void;
  getLivePodOccupancy(key: LivePodOccupancyKey): LivePodOccupancyRecord | null;
  getLivePodOccupancyByTaskId(taskId: string): LivePodOccupancyRecord | null;
  listLivePodOccupancy(siteId: string): LivePodOccupancyRecord[];
  beginLivePodOccupancy(key: LivePodOccupancyKey, taskId: string): BeginLivePodOccupancyResult;
  completeLivePodOccupancy(taskId: string): void;
  abandonLivePodOccupancy(taskId: string): void;
  seedFirstOperatorIfEmpty(opts: {
    username: string;
    email: string;
    password: string;
  }): Promise<boolean>;
  getOperatorAccount(username: string): OperatorAccountRecord | null;
  verifyOperatorPassword(username: string, password: string): Promise<boolean>;
  createSession(opts: {
    username: string;
    clientIp: string;
    userAgent?: string | null;
    now?: Date;
  }): OperatorSessionRecord;
  getSession(id: string, now?: Date): OperatorSessionRecord | null;
  touchSession(id: string, now?: Date): void;
  appendLoginEvent(opts: {
    username: string;
    outcome: LoginEventOutcome;
    clientIp: string;
    at?: Date;
  }): LoginEventRecord;
  listLoginEvents(opts?: { username?: string; now?: Date }): LoginEventRecord[];
  isLoginLocked(username: string, now?: Date): boolean;
  revokeSession(id: string): void;
  countSessions(opts?: { username?: string; now?: Date }): number;
  createOperatorAccount(opts: {
    actorUsername: string;
    username: string;
    email: string;
    displayName: string;
    role: OperatorRole;
  }): Promise<CreateOperatorResult>;
  disableOperatorAccount(opts: {
    actorUsername: string;
    username: string;
  }): DisableOperatorResult;
  enableOperatorAccount(opts: {
    actorUsername: string;
    username: string;
  }): DisableOperatorResult;
  updateOperatorAccount(opts: {
    actorUsername: string;
    username: string;
    email?: string;
    displayName?: string;
    role?: OperatorRole;
  }): MutateOperatorResult;
  resetOperatorPassword(opts: {
    actorUsername: string;
    username: string;
  }): Promise<ResetOperatorPasswordResult>;
  clearSecondFactor(opts: {
    actorUsername: string;
    username: string;
    totpCode?: string;
    now?: Date;
  }): MutateOperatorResult;
  clearLoginLockout(opts: {
    actorUsername: string;
    username: string;
    now?: Date;
  }): MutateOperatorResult;
  changeOwnLastingPassword(opts: {
    username: string;
    currentPassword: string;
    newPassword: string;
    totpCode?: string;
    now?: Date;
  }): Promise<MutateOperatorResult>;
  lastSuccessfulLoginAt(username: string, now?: Date): string | null;
  listUnmatchedLoginEvents(now?: Date): LoginEventRecord[];
  listSessions(opts?: { username?: string; now?: Date }): OperatorSessionRecord[];
  enrollSecondFactor(opts: {
    username: string;
    secret: string;
    code: string;
    now?: Date;
  }): { ok: true } | { ok: false };
  verifySecondFactor(opts: { username: string; code: string; now?: Date }): boolean;
  listOperatorAccounts(): OperatorAccountRecord[];
};

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_credential (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runtime_setting (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS config_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      action TEXT NOT NULL,
      setting TEXT NOT NULL,
      outcome TEXT NOT NULL,
      actor TEXT NOT NULL,
      detail TEXT
    );
    CREATE TABLE IF NOT EXISTS smart_logging_pref (
      operator_key TEXT NOT NULL,
      site_id TEXT NOT NULL,
      watchlist_json TEXT NOT NULL,
      active_index TEXT,
      categories_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (operator_key, site_id)
    );
    CREATE TABLE IF NOT EXISTS live_pod_diagnostics_occupancy (
      site_id TEXT NOT NULL,
      namespace TEXT NOT NULL,
      pod TEXT NOT NULL,
      task_id TEXT NOT NULL,
      in_flight INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (site_id, namespace, pod)
    );
    CREATE INDEX IF NOT EXISTS idx_live_pod_occupancy_task
      ON live_pod_diagnostics_occupancy (task_id);
    CREATE TABLE IF NOT EXISTS operator_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('platform_owner', 'operator', 'application_developer', 'viewer')),
      disabled INTEGER NOT NULL DEFAULT 0,
      totp_secret TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS operator_session (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      client_ip TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS operator_login_event (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      outcome TEXT NOT NULL,
      client_ip TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS release_notes_last_read (
      operator_key TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gitlab_access (
      username TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gitlab_oauth_pending (
      state TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
}

const DIFY_KEY = 'dify_credentials';
const MYSQL_KEY = 'mysql_proxy_enabled';
const MODEL_RATE_KEY = 'model_rate_table';
const GITLAB_OAUTH_KEY = 'gitlab_oauth_client';
const GITLAB_READ_KEY = 'gitlab_read_access';
const LEGACY_IMPORT_META = 'legacy_data_imported';

function migrateAdminCredentialIfNeeded(db: DatabaseSync): void {
  const existing = db.prepare('SELECT id FROM operator_account LIMIT 1').get();
  if (existing) return;
  const admin = db.prepare(
    'SELECT username, password_hash FROM admin_credential WHERE id = 1',
  ).get() as { username: string; password_hash: string } | undefined;
  if (!admin) return;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO operator_account
       (username, email, password_hash, role, disabled, created_at, updated_at)
     VALUES (?, ?, ?, 'platform_owner', 0, ?, ?)`,
  ).run(admin.username, `${admin.username}@localhost`, admin.password_hash, now, now);
}

function iso(d: Date): string {
  return d.toISOString();
}

const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_MS = 24 * 60 * 60 * 1000;
const LOGIN_LOCK_FAILURES = 5;
const LOGIN_LOCK_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

function migrateOperatorAccountColumns(db: DatabaseSync): void {
  const cols = db.prepare('PRAGMA table_info(operator_account)').all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('totp_secret')) {
    db.exec('ALTER TABLE operator_account ADD COLUMN totp_secret TEXT');
  }
  if (!names.has('display_name')) {
    db.exec('ALTER TABLE operator_account ADD COLUMN display_name TEXT');
  }
}

/** Widen Operator Role CHECK so Application Developer can be stored (existing DBs keep the old CHECK). */
function migrateOperatorRoleCheck(db: DatabaseSync): void {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'operator_account'`)
    .get() as { sql: string } | undefined;
  if (!row?.sql || row.sql.includes('application_developer')) return;
  db.exec(`
    CREATE TABLE operator_account_role_mig (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('platform_owner', 'operator', 'application_developer', 'viewer')),
      disabled INTEGER NOT NULL DEFAULT 0,
      totp_secret TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO operator_account_role_mig
      (id, username, email, display_name, password_hash, role, disabled, totp_secret, created_at, updated_at)
    SELECT id, username, email, display_name, password_hash, role, disabled, totp_secret, created_at, updated_at
    FROM operator_account;
    DROP TABLE operator_account;
    ALTER TABLE operator_account_role_mig RENAME TO operator_account;
  `);
}

export function openLocalSettingsStore(dbPath: string): LocalSettingsStore {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  migrate(db);
  migrateAdminCredentialIfNeeded(db);
  migrateOperatorAccountColumns(db);
  migrateOperatorRoleCheck(db);

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

  type OccupancyRow = {
    site_id: string;
    namespace: string;
    pod: string;
    task_id: string;
    in_flight: number;
  };

  function occupancyFromRow(row: OccupancyRow): LivePodOccupancyRecord {
    return {
      siteId: row.site_id,
      namespace: row.namespace,
      pod: row.pod,
      taskId: row.task_id,
      inFlight: row.in_flight === 1,
    };
  }

  let closed = false;
  const store: LocalSettingsStore = {
    close() {
      if (closed) return;
      closed = true;
      db.close();
    },

    async seedAdminIfEmpty(opts) {
      const existing = db.prepare('SELECT id FROM admin_credential WHERE id = 1').get();
      if (existing) return false;
      const hash = await hashAdminPassword(opts.password);
      db.prepare(
        `INSERT INTO admin_credential (id, username, password_hash, updated_at)
         VALUES (1, ?, ?, ?)`,
      ).run(opts.username, hash, new Date().toISOString());
      await store.seedFirstOperatorIfEmpty({
        username: opts.username,
        email: `${opts.username.trim()}@localhost`,
        password: opts.password,
      });
      return true;
    },

    async verifyAdmin(username, password) {
      const row = db.prepare(
        'SELECT username, password_hash FROM admin_credential WHERE id = 1',
      ).get() as { username: string; password_hash: string } | undefined;
      if (!row || row.username !== username) return false;
      return verifyAdminPassword(password, row.password_hash);
    },

    getAdminUsername() {
      const row = db.prepare('SELECT username FROM admin_credential WHERE id = 1').get() as
        | { username: string }
        | undefined;
      return row?.username ?? null;
    },

    async changeAdmin(opts) {
      const row = db.prepare(
        'SELECT username, password_hash FROM admin_credential WHERE id = 1',
      ).get() as { username: string; password_hash: string } | undefined;
      if (!row) {
        return { ok: false, code: 'BAD_REQUEST', error: 'Admin credential not initialized' };
      }
      const ok = await verifyAdminPassword(opts.currentPassword, row.password_hash);
      if (!ok) {
        return { ok: false, code: 'UNAUTHORIZED', error: 'Current password is incorrect' };
      }
      const newUser = opts.newUsername.trim();
      const newPass = opts.newPassword;
      if (!newUser || !newPass) {
        return { ok: false, code: 'BAD_REQUEST', error: 'Username and password are required' };
      }
      const hash = await hashAdminPassword(newPass);
      db.prepare(
        `UPDATE admin_credential SET username = ?, password_hash = ?, updated_at = ? WHERE id = 1`,
      ).run(newUser, hash, new Date().toISOString());
      return { ok: true };
    },

    getDifyOverride() {
      const row = db.prepare('SELECT value FROM runtime_setting WHERE key = ?').get(DIFY_KEY) as
        | { value: string }
        | undefined;
      if (!row) return null;
      try {
        const parsed = JSON.parse(row.value) as Partial<DifyCredentialValues>;
        if (
          typeof parsed.baseUrl === 'string' &&
          typeof parsed.apiKey === 'string' &&
          typeof parsed.toolToken === 'string'
        ) {
          return {
            baseUrl: parsed.baseUrl,
            apiKey: parsed.apiKey,
            toolToken: parsed.toolToken,
          };
        }
      } catch {
        /* ignore */
      }
      return null;
    },

    setDifyOverride(values) {
      db.prepare(
        `INSERT INTO runtime_setting (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(DIFY_KEY, JSON.stringify(values), new Date().toISOString());
    },

    clearDifyOverride() {
      db.prepare('DELETE FROM runtime_setting WHERE key = ?').run(DIFY_KEY);
    },

    getMysqlProxyEnabled() {
      const row = db.prepare('SELECT value FROM runtime_setting WHERE key = ?').get(MYSQL_KEY) as
        | { value: string }
        | undefined;
      if (!row) return null;
      if (row.value === 'true') return true;
      if (row.value === 'false') return false;
      return null;
    },

    setMysqlProxyEnabled(enabled) {
      db.prepare(
        `INSERT INTO runtime_setting (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(MYSQL_KEY, enabled ? 'true' : 'false', new Date().toISOString());
    },

    getModelRateTable() {
      const row = db.prepare('SELECT value FROM runtime_setting WHERE key = ?').get(MODEL_RATE_KEY) as
        | { value: string }
        | undefined;
      if (!row) return null;
      try {
        return parseModelRateTable(JSON.parse(row.value));
      } catch {
        return null;
      }
    },

    setModelRateTable(table) {
      db.prepare(
        `INSERT INTO runtime_setting (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(MODEL_RATE_KEY, JSON.stringify(table), new Date().toISOString());
    },

    getGitLabOAuthClient() {
      const row = db
        .prepare('SELECT value FROM runtime_setting WHERE key = ?')
        .get(GITLAB_OAUTH_KEY) as { value: string } | undefined;
      if (!row) return null;
      try {
        const parsed = JSON.parse(row.value) as Partial<GitLabOAuthClientValues>;
        if (
          typeof parsed.baseUrl === 'string' &&
          typeof parsed.clientId === 'string' &&
          typeof parsed.clientSecret === 'string'
        ) {
          return {
            baseUrl: parsed.baseUrl,
            clientId: parsed.clientId,
            clientSecret: parsed.clientSecret,
          };
        }
      } catch {
        /* ignore */
      }
      return null;
    },

    setGitLabOAuthClient(values) {
      db.prepare(
        `INSERT INTO runtime_setting (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(GITLAB_OAUTH_KEY, JSON.stringify(values), new Date().toISOString());
    },

    clearGitLabOAuthClient() {
      db.prepare('DELETE FROM runtime_setting WHERE key = ?').run(GITLAB_OAUTH_KEY);
    },

    getGitLabReadAccess() {
      const row = db
        .prepare('SELECT value FROM runtime_setting WHERE key = ?')
        .get(GITLAB_READ_KEY) as { value: string } | undefined;
      if (!row) return null;
      try {
        const parsed = JSON.parse(row.value) as Partial<GitLabReadAccessValues>;
        if (typeof parsed.token === 'string') {
          return { token: parsed.token };
        }
      } catch {
        /* ignore */
      }
      return null;
    },

    setGitLabReadAccess(values) {
      db.prepare(
        `INSERT INTO runtime_setting (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(GITLAB_READ_KEY, JSON.stringify(values), new Date().toISOString());
    },

    clearGitLabReadAccess() {
      db.prepare('DELETE FROM runtime_setting WHERE key = ?').run(GITLAB_READ_KEY);
    },

    getGitLabAccess(username) {
      const row = db
        .prepare(
          `SELECT username, access_token, refresh_token, expires_at, updated_at
           FROM gitlab_access WHERE username = ? COLLATE NOCASE`,
        )
        .get(username.trim()) as
        | {
            username: string;
            access_token: string;
            refresh_token: string | null;
            expires_at: string | null;
            updated_at: string;
          }
        | undefined;
      if (!row) return null;
      return {
        username: row.username,
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        expiresAt: row.expires_at,
        updatedAt: row.updated_at,
      };
    },

    setGitLabAccess(opts) {
      const username = opts.username.trim();
      if (!username || !opts.accessToken) return;
      const updatedAt = iso(opts.now ?? new Date());
      db.prepare(
        `INSERT INTO gitlab_access (username, access_token, refresh_token, expires_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(username) DO UPDATE SET
           access_token = excluded.access_token,
           refresh_token = excluded.refresh_token,
           expires_at = excluded.expires_at,
           updated_at = excluded.updated_at`,
      ).run(
        username,
        opts.accessToken,
        opts.refreshToken ?? null,
        opts.expiresAt ?? null,
        updatedAt,
      );
    },

    clearGitLabAccess(username) {
      db.prepare('DELETE FROM gitlab_access WHERE username = ? COLLATE NOCASE').run(username.trim());
    },

    putGitLabOAuthPending(opts) {
      db.prepare(
        `INSERT INTO gitlab_oauth_pending (state, username, expires_at)
         VALUES (?, ?, ?)
         ON CONFLICT(state) DO UPDATE SET
           username = excluded.username,
           expires_at = excluded.expires_at`,
      ).run(opts.state, opts.username.trim(), opts.expiresAt);
    },

    takeGitLabOAuthPending(state, now = new Date()) {
      const row = db
        .prepare(`SELECT username, expires_at FROM gitlab_oauth_pending WHERE state = ?`)
        .get(state) as { username: string; expires_at: string } | undefined;
      if (!row) return null;
      db.prepare(`DELETE FROM gitlab_oauth_pending WHERE state = ?`).run(state);
      if (Date.parse(row.expires_at) <= now.getTime()) return null;
      return { username: row.username };
    },

    appendAudit(entry) {
      const full: ConfigAuditEntry = {
        ts: entry.ts ?? new Date().toISOString(),
        action: entry.action,
        setting: entry.setting,
        outcome: entry.outcome,
        actor: entry.actor,
        detail: entry.detail,
      };
      db.prepare(
        `INSERT INTO config_audit (ts, action, setting, outcome, actor, detail)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        full.ts,
        full.action,
        full.setting,
        full.outcome,
        full.actor,
        full.detail ? JSON.stringify(full.detail) : null,
      );
      return full;
    },

    listAudit(limit = 100) {
      const rows = db
        .prepare(
          `SELECT ts, action, setting, outcome, actor, detail FROM config_audit
           ORDER BY id DESC LIMIT ?`,
        )
        .all(limit) as Array<{
        ts: string;
        action: string;
        setting: string;
        outcome: string;
        actor: string;
        detail: string | null;
      }>;
      return rows.map((r) => ({
        ts: r.ts,
        action: r.action as ConfigAuditEntry['action'],
        setting: r.setting,
        outcome: r.outcome as ConfigAuditOutcome,
        actor: r.actor,
        detail: r.detail ? (JSON.parse(r.detail) as Record<string, unknown>) : undefined,
      }));
    },

    importLegacyDataDir(dataDir) {
      if (getMeta(LEGACY_IMPORT_META) === '1') return false;
      let imported = false;

      const difyFile = path.join(dataDir, 'dify-credentials.json');
      try {
        const raw = fs.readFileSync(difyFile, 'utf8');
        const parsed = JSON.parse(raw) as Partial<DifyCredentialValues>;
        if (
          typeof parsed.baseUrl === 'string' &&
          typeof parsed.apiKey === 'string' &&
          typeof parsed.toolToken === 'string'
        ) {
          store.setDifyOverride({
            baseUrl: parsed.baseUrl,
            apiKey: parsed.apiKey,
            toolToken: parsed.toolToken,
          });
          fs.renameSync(difyFile, `${difyFile}.migrated`);
          imported = true;
        }
      } catch {
        /* missing */
      }

      const mysqlFile = path.join(dataDir, 'mysql-proxy.json');
      try {
        const raw = fs.readFileSync(mysqlFile, 'utf8');
        const parsed = JSON.parse(raw) as { enabled?: unknown };
        if (typeof parsed.enabled === 'boolean') {
          store.setMysqlProxyEnabled(parsed.enabled);
          fs.renameSync(mysqlFile, `${mysqlFile}.migrated`);
          imported = true;
        }
      } catch {
        /* missing */
      }

      const auditFile = path.join(dataDir, 'config-audit.jsonl');
      try {
        const raw = fs.readFileSync(auditFile, 'utf8');
        for (const line of raw.split('\n')) {
          if (!line.trim()) continue;
          try {
            const e = JSON.parse(line) as ConfigAuditEntry;
            store.appendAudit({
              ts: e.ts,
              action: e.action,
              setting: e.setting,
              outcome: e.outcome,
              actor: e.actor,
              detail: e.detail,
            });
            imported = true;
          } catch {
            /* skip */
          }
        }
        fs.renameSync(auditFile, `${auditFile}.migrated`);
      } catch {
        /* missing */
      }

      setMeta(LEGACY_IMPORT_META, '1');
      return imported;
    },

    getSmartLoggingPrefs(operatorKey, siteId) {
      const op = operatorKey.trim();
      const site = siteId.trim();
      if (!op || !site) {
        return {
          watchlist: [],
          activeIndex: null,
          categories: seedLogCategories(),
          seeded: true,
        };
      }
      const row = db
        .prepare(
          `SELECT watchlist_json, active_index, categories_json
           FROM smart_logging_pref WHERE operator_key = ? AND site_id = ?`,
        )
        .get(op, site) as
        | { watchlist_json: string; active_index: string | null; categories_json: string }
        | undefined;
      if (!row) {
        return {
          watchlist: [],
          activeIndex: null,
          categories: seedLogCategories(),
          seeded: true,
        };
      }
      let watchlist: string[] = [];
      let categories: StoredLogCategory[] = [];
      try {
        const w = JSON.parse(row.watchlist_json);
        watchlist = Array.isArray(w) ? w.map(String) : [];
      } catch {
        watchlist = [];
      }
      try {
        const c = JSON.parse(row.categories_json);
        categories = Array.isArray(c) ? (c as StoredLogCategory[]) : seedLogCategories();
      } catch {
        categories = seedLogCategories();
      }
      return {
        watchlist,
        activeIndex: row.active_index?.trim() || null,
        categories,
        seeded: false,
      };
    },

    putSmartLoggingPrefs(operatorKey, siteId, prefs) {
      const op = operatorKey.trim();
      const site = siteId.trim();
      if (!op || !site) throw new Error('operatorKey and siteId are required');
      const watchlist = (prefs.watchlist ?? []).map((p) => String(p).trim()).filter(Boolean);
      const active =
        prefs.activeIndex?.trim() && watchlist.includes(prefs.activeIndex.trim())
          ? prefs.activeIndex.trim()
          : watchlist[0] ?? null;
      const categories = Array.isArray(prefs.categories) ? prefs.categories : seedLogCategories();
      db.prepare(
        `INSERT INTO smart_logging_pref
           (operator_key, site_id, watchlist_json, active_index, categories_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(operator_key, site_id) DO UPDATE SET
           watchlist_json = excluded.watchlist_json,
           active_index = excluded.active_index,
           categories_json = excluded.categories_json,
           updated_at = excluded.updated_at`,
      ).run(
        op,
        site,
        JSON.stringify(watchlist),
        active,
        JSON.stringify(categories),
        new Date().toISOString(),
      );
    },

    getReleaseNotesLastRead(operatorKey) {
      const op = operatorKey.trim();
      if (!op) return null;
      const row = db
        .prepare('SELECT version FROM release_notes_last_read WHERE operator_key = ?')
        .get(op) as { version: string } | undefined;
      const version = row?.version?.trim() ?? '';
      return parseReleaseVersion(version) ? version : null;
    },

    putReleaseNotesLastRead(operatorKey, version) {
      const op = operatorKey.trim();
      const v = version.trim();
      if (!op || !parseReleaseVersion(v)) return;
      db.prepare(
        `INSERT INTO release_notes_last_read (operator_key, version, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(operator_key) DO UPDATE SET
           version = excluded.version,
           updated_at = excluded.updated_at`,
      ).run(op, v, new Date().toISOString());
    },

    getLivePodOccupancy(key) {
      const site = key.siteId.trim();
      const namespace = key.namespace.trim();
      const pod = key.pod.trim();
      if (!site || !namespace || !pod) return null;
      const row = db
        .prepare(
          `SELECT site_id, namespace, pod, task_id, in_flight
           FROM live_pod_diagnostics_occupancy
           WHERE site_id = ? AND namespace = ? AND pod = ?`,
        )
        .get(site, namespace, pod) as OccupancyRow | undefined;
      return row ? occupancyFromRow(row) : null;
    },

    getLivePodOccupancyByTaskId(taskId) {
      const id = taskId.trim();
      if (!id) return null;
      const row = db
        .prepare(
          `SELECT site_id, namespace, pod, task_id, in_flight
           FROM live_pod_diagnostics_occupancy WHERE task_id = ?`,
        )
        .get(id) as OccupancyRow | undefined;
      return row ? occupancyFromRow(row) : null;
    },

    listLivePodOccupancy(siteId) {
      const site = siteId.trim();
      if (!site) return [];
      const rows = db
        .prepare(
          `SELECT site_id, namespace, pod, task_id, in_flight
           FROM live_pod_diagnostics_occupancy WHERE site_id = ?`,
        )
        .all(site) as OccupancyRow[];
      return rows.map(occupancyFromRow);
    },

    beginLivePodOccupancy(key, taskId) {
      const site = key.siteId.trim();
      const namespace = key.namespace.trim();
      const pod = key.pod.trim();
      const id = taskId.trim();
      if (!site || !namespace || !pod || !id) {
        throw new Error('siteId, namespace, pod, and taskId are required');
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        const existing = db
          .prepare(
            `SELECT in_flight FROM live_pod_diagnostics_occupancy
             WHERE site_id = ? AND namespace = ? AND pod = ?`,
          )
          .get(site, namespace, pod) as { in_flight: number } | undefined;
        if (existing?.in_flight === 1) {
          db.exec('ROLLBACK');
          return { ok: false, code: 'IN_FLIGHT' as const };
        }
        db.prepare(
          `INSERT INTO live_pod_diagnostics_occupancy
             (site_id, namespace, pod, task_id, in_flight, updated_at)
           VALUES (?, ?, ?, ?, 1, ?)
           ON CONFLICT(site_id, namespace, pod) DO UPDATE SET
             task_id = excluded.task_id,
             in_flight = 1,
             updated_at = excluded.updated_at`,
        ).run(site, namespace, pod, id, new Date().toISOString());
        db.exec('COMMIT');
        return { ok: true as const };
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          /* */
        }
        throw err;
      }
    },

    completeLivePodOccupancy(taskId) {
      const id = taskId.trim();
      if (!id) return;
      db.prepare(
        `UPDATE live_pod_diagnostics_occupancy
         SET in_flight = 0, updated_at = ?
         WHERE task_id = ?`,
      ).run(new Date().toISOString(), id);
    },

    abandonLivePodOccupancy(taskId) {
      const id = taskId.trim();
      if (!id) return;
      db.prepare(`DELETE FROM live_pod_diagnostics_occupancy WHERE task_id = ?`).run(id);
    },

    async seedFirstOperatorIfEmpty(opts) {
      const existing = db.prepare('SELECT id FROM operator_account LIMIT 1').get();
      if (existing) return false;
      const username = opts.username.trim();
      const email = opts.email.trim().toLowerCase();
      if (!username || !email || !opts.password) return false;
      const hash = await hashAdminPassword(opts.password);
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO operator_account
           (username, email, password_hash, role, disabled, created_at, updated_at)
         VALUES (?, ?, ?, 'platform_owner', 0, ?, ?)`,
      ).run(username, email, hash, now, now);
      return true;
    },

    getOperatorAccount(username) {
      const row = db
        .prepare(
          `SELECT username, email, display_name, role, disabled, totp_secret FROM operator_account WHERE username = ?`,
        )
        .get(username.trim()) as
        | {
            username: string;
            email: string;
            display_name: string | null;
            role: OperatorRole;
            disabled: number;
            totp_secret: string | null;
          }
        | undefined;
      if (!row) return null;
      const displayName = row.display_name?.trim() || null;
      return {
        username: row.username,
        email: row.email,
        displayName,
        role: row.role,
        disabled: row.disabled === 1,
        secondFactorEnrolled: Boolean(row.totp_secret),
      };
    },

    async verifyOperatorPassword(username, password) {
      const row = db
        .prepare(`SELECT password_hash, disabled FROM operator_account WHERE username = ?`)
        .get(username.trim()) as { password_hash: string; disabled: number } | undefined;
      if (!row || row.disabled === 1) return false;
      return verifyAdminPassword(password, row.password_hash);
    },

    createSession(opts) {
      const username = opts.username.trim();
      const id = randomBytes(32).toString('base64url');
      const now = iso(opts.now ?? new Date());
      db.prepare(
        `INSERT INTO operator_session
           (id, username, client_ip, user_agent, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, username, opts.clientIp, opts.userAgent ?? null, now, now);
      return {
        id,
        username,
        clientIp: opts.clientIp,
        userAgent: opts.userAgent ?? null,
        createdAt: now,
        lastSeenAt: now,
      };
    },

    getSession(id, now) {
      const row = db
        .prepare(
          `SELECT id, username, client_ip, user_agent, created_at, last_seen_at
           FROM operator_session WHERE id = ?`,
        )
        .get(id) as
        | {
            id: string;
            username: string;
            client_ip: string;
            user_agent: string | null;
            created_at: string;
            last_seen_at: string;
          }
        | undefined;
      if (!row) return null;
      const at = now ?? new Date();
      const created = Date.parse(row.created_at);
      const lastSeen = Date.parse(row.last_seen_at);
      if (
        !Number.isFinite(created) ||
        !Number.isFinite(lastSeen) ||
        at.getTime() - lastSeen > SESSION_IDLE_MS ||
        at.getTime() - created > SESSION_ABSOLUTE_MS
      ) {
        db.prepare('DELETE FROM operator_session WHERE id = ?').run(id);
        return null;
      }
      return {
        id: row.id,
        username: row.username,
        clientIp: row.client_ip,
        userAgent: row.user_agent,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
      };
    },

    touchSession(id, now) {
      db.prepare(`UPDATE operator_session SET last_seen_at = ? WHERE id = ?`).run(
        iso(now ?? new Date()),
        id,
      );
    },

    appendLoginEvent(opts) {
      const at = iso(opts.at ?? new Date());
      const username = opts.username.trim();
      db.prepare(
        `INSERT INTO operator_login_event (username, outcome, client_ip, at)
         VALUES (?, ?, ?, ?)`,
      ).run(username, opts.outcome, opts.clientIp, at);
      return { username, outcome: opts.outcome, clientIp: opts.clientIp, at };
    },

    listLoginEvents(opts) {
      const now = opts?.now ?? new Date();
      const cutoff = iso(new Date(now.getTime() - LOGIN_EVENT_RETENTION_MS));
      db.prepare(`DELETE FROM operator_login_event WHERE at < ?`).run(cutoff);
      const username = opts?.username?.trim();
      const rows = (
        username
          ? db
              .prepare(
                `SELECT username, outcome, client_ip, at FROM operator_login_event
                 WHERE username = ? ORDER BY at DESC`,
              )
              .all(username)
          : db
              .prepare(
                `SELECT username, outcome, client_ip, at FROM operator_login_event
                 ORDER BY at DESC`,
              )
              .all()
      ) as { username: string; outcome: LoginEventOutcome; client_ip: string; at: string }[];
      return rows.map((r) => ({
        username: r.username,
        outcome: r.outcome,
        clientIp: r.client_ip,
        at: r.at,
      }));
    },

    isLoginLocked(username, now) {
      const at = now ?? new Date();
      const windowStart = iso(new Date(at.getTime() - LOGIN_LOCK_WINDOW_MS));
      const name = username.trim();
      const unlock = db
        .prepare(
          `SELECT MAX(at) AS at FROM operator_login_event
           WHERE username = ? AND outcome = 'unlock' AND at >= ?`,
        )
        .get(name, windowStart) as { at: string | null } | undefined;
      const failureFloor = unlock?.at ?? '0000-01-01T00:00:00.000Z';
      const row = db
        .prepare(
          `SELECT COUNT(*) AS n FROM operator_login_event
           WHERE username = ? AND outcome = 'failure' AND at >= ? AND at > ?`,
        )
        .get(name, windowStart, failureFloor) as { n: number };
      return Number(row?.n ?? 0) >= LOGIN_LOCK_FAILURES;
    },

    revokeSession(id) {
      db.prepare('DELETE FROM operator_session WHERE id = ?').run(id);
    },

    countSessions(opts) {
      const at = opts?.now ?? new Date();
      const idleCutoff = iso(new Date(at.getTime() - SESSION_IDLE_MS));
      const absCutoff = iso(new Date(at.getTime() - SESSION_ABSOLUTE_MS));
      const username = opts?.username?.trim();
      const row = (
        username
          ? db
              .prepare(
                `SELECT COUNT(*) AS n FROM operator_session
                 WHERE username = ? AND last_seen_at >= ? AND created_at >= ?`,
              )
              .get(username, idleCutoff, absCutoff)
          : db
              .prepare(
                `SELECT COUNT(*) AS n FROM operator_session
                 WHERE last_seen_at >= ? AND created_at >= ?`,
              )
              .get(idleCutoff, absCutoff)
      ) as { n: number };
      return Number(row?.n ?? 0);
    },

    lastSuccessfulLoginAt(username, now) {
      const hit = store
        .listLoginEvents({ username, now })
        .find((e) => e.outcome === 'success');
      return hit?.at ?? null;
    },

    listUnmatchedLoginEvents(now) {
      const known = new Set(store.listOperatorAccounts().map((a) => a.username));
      return store.listLoginEvents({ now }).filter((e) => !known.has(e.username));
    },

    listSessions(opts) {
      const at = opts?.now ?? new Date();
      const idleCutoff = iso(new Date(at.getTime() - SESSION_IDLE_MS));
      const absCutoff = iso(new Date(at.getTime() - SESSION_ABSOLUTE_MS));
      const username = opts?.username?.trim();
      const rows = (
        username
          ? db
              .prepare(
                `SELECT id, username, client_ip, user_agent, created_at, last_seen_at
                 FROM operator_session
                 WHERE username = ? AND last_seen_at >= ? AND created_at >= ?
                 ORDER BY last_seen_at DESC`,
              )
              .all(username, idleCutoff, absCutoff)
          : db
              .prepare(
                `SELECT id, username, client_ip, user_agent, created_at, last_seen_at
                 FROM operator_session
                 WHERE last_seen_at >= ? AND created_at >= ?
                 ORDER BY last_seen_at DESC`,
              )
              .all(idleCutoff, absCutoff)
      ) as {
        id: string;
        username: string;
        client_ip: string;
        user_agent: string | null;
        created_at: string;
        last_seen_at: string;
      }[];
      return rows.map((row) => ({
        id: row.id,
        username: row.username,
        clientIp: row.client_ip,
        userAgent: row.user_agent,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
      }));
    },

    async createOperatorAccount(opts) {
      const actor = store.getOperatorAccount(opts.actorUsername);
      if (!actor || actor.disabled || actor.role !== 'platform_owner') {
        return { ok: false, code: 'FORBIDDEN', error: 'Platform Owner required' };
      }
      const username = opts.username.trim();
      const email = opts.email.trim().toLowerCase();
      const role = opts.role;
      const display = normalizeOperatorDisplayName(opts.displayName);
      if (!username || !email || !isOperatorRole(role)) {
        return { ok: false, code: 'BAD_REQUEST', error: 'Username, email, and role are required' };
      }
      if (!display.ok) {
        return { ok: false, code: 'BAD_REQUEST', error: display.error };
      }
      if (username.toLowerCase() === 'opsgpt') {
        return { ok: false, code: 'BAD_REQUEST', error: 'Username OPSGPT is reserved' };
      }
      if (store.getOperatorAccount(username) || emailTaken(email)) {
        return { ok: false, code: 'CONFLICT', error: 'Username or Operator Email already exists' };
      }
      const temporaryPassword = randomBytes(12).toString('base64url');
      const hash = await hashAdminPassword(temporaryPassword);
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO operator_account
           (username, email, display_name, password_hash, role, disabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      ).run(username, email, display.value, hash, role, now, now);
      return { ok: true, temporaryPassword };
    },

    disableOperatorAccount(opts) {
      const actor = store.getOperatorAccount(opts.actorUsername);
      if (!actor || actor.disabled || actor.role !== 'platform_owner') {
        return { ok: false, code: 'FORBIDDEN', error: 'Platform Owner required' };
      }
      const target = store.getOperatorAccount(opts.username);
      if (!target) return { ok: false, code: 'BAD_REQUEST', error: 'Operator Account not found' };
      if (target.role === 'platform_owner') {
        const n = db
          .prepare(
            `SELECT COUNT(*) AS n FROM operator_account
             WHERE role = 'platform_owner' AND disabled = 0`,
          )
          .get() as { n: number };
        if (Number(n.n) <= 1) {
          return { ok: false, code: 'FORBIDDEN', error: 'Cannot disable the last Platform Owner' };
        }
      }
      db.prepare(
        `UPDATE operator_account SET disabled = 1, updated_at = ? WHERE username = ?`,
      ).run(new Date().toISOString(), target.username);
      db.prepare(`DELETE FROM operator_session WHERE username = ?`).run(target.username);
      store.clearGitLabAccess(target.username);
      db.prepare(`DELETE FROM gitlab_oauth_pending WHERE username = ? COLLATE NOCASE`).run(
        target.username,
      );
      return { ok: true };
    },

    enableOperatorAccount(opts) {
      const actor = store.getOperatorAccount(opts.actorUsername);
      if (!actor || actor.disabled || actor.role !== 'platform_owner') {
        return { ok: false, code: 'FORBIDDEN', error: 'Platform Owner required' };
      }
      const target = store.getOperatorAccount(opts.username);
      if (!target) return { ok: false, code: 'BAD_REQUEST', error: 'Operator Account not found' };
      db.prepare(`UPDATE operator_account SET disabled = 0, updated_at = ? WHERE username = ?`).run(
        new Date().toISOString(),
        target.username,
      );
      return { ok: true };
    },

    updateOperatorAccount(opts) {
      const actor = store.getOperatorAccount(opts.actorUsername);
      if (!actor || actor.disabled || actor.role !== 'platform_owner') {
        return { ok: false, code: 'FORBIDDEN', error: 'Platform Owner required' };
      }
      const target = store.getOperatorAccount(opts.username);
      if (!target) return { ok: false, code: 'BAD_REQUEST', error: 'Operator Account not found' };
      const email =
        typeof opts.email === 'string' ? opts.email.trim().toLowerCase() : target.email;
      const role = opts.role ?? target.role;
      if (!email || !isOperatorRole(role)) {
        return { ok: false, code: 'BAD_REQUEST', error: 'Operator Email and role are required' };
      }
      if (email !== target.email && emailTaken(email)) {
        return { ok: false, code: 'CONFLICT', error: 'Operator Email already exists' };
      }
      if (
        target.role === 'platform_owner' &&
        role !== 'platform_owner' &&
        !target.disabled &&
        enabledOwnerCount() <= 1
      ) {
        return { ok: false, code: 'FORBIDDEN', error: 'Cannot demote the last Platform Owner' };
      }
      let displayName = target.displayName;
      if (typeof opts.displayName === 'string') {
        const normalized = normalizeOperatorDisplayName(opts.displayName);
        if (!normalized.ok) {
          return { ok: false, code: 'BAD_REQUEST', error: normalized.error };
        }
        displayName = normalized.value;
      }
      db.prepare(
        `UPDATE operator_account SET email = ?, display_name = ?, role = ?, updated_at = ? WHERE username = ?`,
      ).run(email, displayName, role, new Date().toISOString(), target.username);
      return { ok: true };
    },

    async resetOperatorPassword(opts) {
      const actor = store.getOperatorAccount(opts.actorUsername);
      if (!actor || actor.disabled || actor.role !== 'platform_owner') {
        return { ok: false, code: 'FORBIDDEN', error: 'Platform Owner required' };
      }
      const target = store.getOperatorAccount(opts.username);
      if (!target) return { ok: false, code: 'BAD_REQUEST', error: 'Operator Account not found' };
      const temporaryPassword = randomBytes(12).toString('base64url');
      const hash = await hashAdminPassword(temporaryPassword);
      db.prepare(
        `UPDATE operator_account
         SET password_hash = ?, totp_secret = NULL, updated_at = ?
         WHERE username = ?`,
      ).run(hash, new Date().toISOString(), target.username);
      db.prepare(`DELETE FROM operator_session WHERE username = ?`).run(target.username);
      return { ok: true, temporaryPassword };
    },

    clearSecondFactor(opts) {
      const actor = store.getOperatorAccount(opts.actorUsername);
      if (!actor || actor.disabled || actor.role !== 'platform_owner') {
        return { ok: false, code: 'FORBIDDEN', error: 'Platform Owner required' };
      }
      const target = store.getOperatorAccount(opts.username);
      if (!target) return { ok: false, code: 'BAD_REQUEST', error: 'Operator Account not found' };
      if (actor.username === target.username) {
        if (!store.verifySecondFactor({ username: target.username, code: opts.totpCode ?? '', now: opts.now })) {
          return { ok: false, code: 'UNAUTHORIZED', error: 'Second Factor required' };
        }
      }
      db.prepare(
        `UPDATE operator_account SET totp_secret = NULL, updated_at = ? WHERE username = ?`,
      ).run(new Date().toISOString(), target.username);
      return { ok: true };
    },

    clearLoginLockout(opts) {
      const actor = store.getOperatorAccount(opts.actorUsername);
      if (!actor || actor.disabled || actor.role !== 'platform_owner') {
        return { ok: false, code: 'FORBIDDEN', error: 'Platform Owner required' };
      }
      const target = store.getOperatorAccount(opts.username);
      if (!target) return { ok: false, code: 'BAD_REQUEST', error: 'Operator Account not found' };
      store.appendLoginEvent({
        username: target.username,
        outcome: 'unlock',
        clientIp: 'owner',
        at: opts.now,
      });
      return { ok: true };
    },

    async changeOwnLastingPassword(opts) {
      const username = opts.username.trim();
      const account = store.getOperatorAccount(username);
      if (!account || account.disabled) {
        return { ok: false, code: 'UNAUTHORIZED', error: 'Operator Account not found' };
      }
      const currentOk = await store.verifyOperatorPassword(username, opts.currentPassword);
      if (!currentOk) {
        return { ok: false, code: 'UNAUTHORIZED', error: 'Current Lasting Password is incorrect' };
      }
      const next = opts.newPassword;
      if (!next || next.length < 12 || next === username) {
        return {
          ok: false,
          code: 'BAD_REQUEST',
          error: 'Lasting Password must be at least 12 characters and not equal Username',
        };
      }
      if (account.secondFactorEnrolled) {
        if (!store.verifySecondFactor({ username, code: opts.totpCode ?? '', now: opts.now })) {
          return { ok: false, code: 'UNAUTHORIZED', error: 'Second Factor required' };
        }
      }
      const hash = await hashAdminPassword(next);
      db.prepare(`UPDATE operator_account SET password_hash = ?, updated_at = ? WHERE username = ?`).run(
        hash,
        new Date().toISOString(),
        username,
      );
      return { ok: true };
    },

    enrollSecondFactor(opts) {
      const account = store.getOperatorAccount(opts.username);
      if (!account || account.disabled) return { ok: false };
      const nowMs = (opts.now ?? new Date()).getTime();
      if (!verifyTotp(opts.secret, opts.code, nowMs)) return { ok: false };
      db.prepare(
        `UPDATE operator_account SET totp_secret = ?, updated_at = ? WHERE username = ?`,
      ).run(opts.secret, new Date().toISOString(), account.username);
      return { ok: true };
    },

    verifySecondFactor(opts) {
      const row = db
        .prepare(`SELECT totp_secret, disabled FROM operator_account WHERE username = ?`)
        .get(opts.username.trim()) as { totp_secret: string | null; disabled: number } | undefined;
      if (!row || row.disabled === 1 || !row.totp_secret) return false;
      return verifyTotp(row.totp_secret, opts.code, (opts.now ?? new Date()).getTime());
    },

    listOperatorAccounts() {
      const rows = db
        .prepare(
          `SELECT username, email, display_name, role, disabled, totp_secret FROM operator_account
           ORDER BY username`,
        )
        .all() as {
        username: string;
        email: string;
        display_name: string | null;
        role: OperatorRole;
        disabled: number;
        totp_secret: string | null;
      }[];
      return rows.map((row) => ({
        username: row.username,
        email: row.email,
        displayName: row.display_name?.trim() || null,
        role: row.role,
        disabled: row.disabled === 1,
        secondFactorEnrolled: Boolean(row.totp_secret),
      }));
    },
  };

  function emailTaken(email: string): boolean {
    const row = db.prepare('SELECT id FROM operator_account WHERE email = ?').get(email);
    return Boolean(row);
  }

  function enabledOwnerCount(): number {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS n FROM operator_account
         WHERE role = 'platform_owner' AND disabled = 0`,
      )
      .get() as { n: number };
    return Number(row?.n ?? 0);
  }

  return store;
}

const DEFAULT_DB = path.join(process.cwd(), '.data', 'nextops.sqlite');

let singleton: LocalSettingsStore | null = null;

/** Process-wide store; opens and migrates on first use. */
export function getLocalSettingsStore(opts?: {
  dbPath?: string;
  seed?: { username: string; password: string };
  legacyDataDir?: string;
}): LocalSettingsStore {
  if (singleton) return singleton;
  const dbPath = opts?.dbPath ?? DEFAULT_DB;
  singleton = openLocalSettingsStore(dbPath);
  const legacyDir = opts?.legacyDataDir ?? path.dirname(dbPath);
  singleton.importLegacyDataDir(legacyDir);
  return singleton;
}

export async function ensureAdminSeeded(
  store: LocalSettingsStore,
  seed: { username: string; password: string },
): Promise<void> {
  await store.seedAdminIfEmpty(seed);
}

/** Test helper */
export function _resetLocalSettingsSingletonForTests(): void {
  if (singleton) {
    try {
      singleton.close();
    } catch {
      /* */
    }
  }
  singleton = null;
}
