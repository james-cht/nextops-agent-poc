import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ProjectMembershipRecord, ProjectRecord } from '../application-online-membership.ts';
import {
  normalizeEnvironmentBindings,
  type EnvironmentBinding,
} from '../environment-binding.ts';
import {
  recordBreakGlassSkip,
  type BreakGlassEntry,
  type BreakGlassRule,
} from '../break-glass.ts';
import type { ResourceRequestSheet } from '../resource-request.ts';
import type { PromotionPath, TemplateFamily } from '../service-deploy-spec.ts';

export type CreateProjectResult =
  | { ok: true; project: ProjectRecord }
  | { ok: false; code: 'BAD_REQUEST' | 'CONFLICT'; error: string };

export type MembershipMutateResult =
  | { ok: true }
  | { ok: false; code: 'BAD_REQUEST' | 'CONFLICT' | 'NOT_FOUND'; error: string };

export type ServiceDeploySpecDraftRecord = {
  nameSpace: string;
  appName: string;
  gitlabUrl: string;
  promotionPath: PromotionPath;
  templateFamily: TemplateFamily;
  packagingCommand: string;
  defaultRef: string;
  k8sNamespace: string;
  updatedAt: string;
  updatedBy: string;
  /** Null until the central MR is merged and published SHA is recorded. */
  publishedPinSha: string | null;
  mrUrl: string | null;
  mrIid: number | null;
  submittedAt: string | null;
  devJobId: string | null;
  lastDevRunId: string | null;
  lastDevRunStatus: string | null;
  lastDevRunAt: string | null;
  runtimeCheckReady: boolean | null;
  runtimeCheckProbe: string | null;
  runtimeCheckAt: string | null;
};

export type SaveSpecDraftResult =
  | { ok: true; draft: ServiceDeploySpecDraftRecord }
  | { ok: false; code: 'BAD_REQUEST' | 'NOT_FOUND'; error: string };

export type SpecArtifactGenerateFieldsRecord = {
  baseImage: string;
  artifactPath: string;
  workdir: string;
  entrypoint: string;
  port: number;
  replicas: number;
  cpu: string;
  memory: string;
  runtimeEnvJson: string;
};

export type SpecArtifactsRecord = {
  nameSpace: string;
  appName: string;
  dockerfile: {
    content: string;
    dirty: boolean;
    fieldsFingerprint: string;
    offCatalogFromWarning: boolean;
  };
  kustomize: {
    base: string;
    overlaysJson: string;
    dirty: boolean;
    fieldsFingerprint: string;
  };
  generateFields: SpecArtifactGenerateFieldsRecord;
  updatedAt: string;
  updatedBy: string;
};

export type SaveSpecArtifactsResult =
  | { ok: true; artifacts: SpecArtifactsRecord }
  | { ok: false; code: 'BAD_REQUEST' | 'NOT_FOUND'; error: string };

export type EnvironmentPinRecord = {
  environment: string;
  publishedPinSha: string;
  jobId: string;
  imageTag: string | null;
  sourceImage: string | null;
  templateFamily: string;
  lastRunStatus: string | null;
};

export type ApplicationOnlineStore = {
  close(): void;
  createProject(opts: { nameSpace: string; now?: Date }): CreateProjectResult;
  listProjects(): ProjectRecord[];
  addMembership(opts: { nameSpace: string; username: string; now?: Date }): MembershipMutateResult;
  removeMembership(opts: { nameSpace: string; username: string }): MembershipMutateResult;
  listMemberships(nameSpace: string): ProjectMembershipRecord[];
  listAllMemberships(): ProjectMembershipRecord[];
  saveSpecDraft(opts: {
    nameSpace: string;
    appName: string;
    gitlabUrl: string;
    promotionPath: PromotionPath;
    templateFamily: TemplateFamily;
    packagingCommand: string;
    defaultRef: string;
    k8sNamespace: string;
    updatedBy: string;
    now?: Date;
  }): SaveSpecDraftResult;
  getSpecDraft(nameSpace: string, appName: string): ServiceDeploySpecDraftRecord | null;
  listSpecDrafts(nameSpace: string): ServiceDeploySpecDraftRecord[];
  saveSpecArtifacts(opts: {
    nameSpace: string;
    appName: string;
    dockerfile: SpecArtifactsRecord['dockerfile'];
    kustomize: SpecArtifactsRecord['kustomize'];
    generateFields: SpecArtifactGenerateFieldsRecord;
    updatedBy: string;
    now?: Date;
  }): SaveSpecArtifactsResult;
  getSpecArtifacts(nameSpace: string, appName: string): SpecArtifactsRecord | null;
  saveResourceRequests(opts: {
    nameSpace: string;
    appName: string;
    sheets: ResourceRequestSheet[];
    updatedBy: string;
    now?: Date;
  }):
    | { ok: true; sheets: ResourceRequestSheet[] }
    | { ok: false; code: 'BAD_REQUEST' | 'NOT_FOUND'; error: string };
  getResourceRequests(nameSpace: string, appName: string): ResourceRequestSheet[] | null;
  saveEnvironmentBindings(opts: {
    nameSpace: string;
    appName: string;
    bindings: EnvironmentBinding[];
    updatedBy: string;
    now?: Date;
  }):
    | { ok: true; bindings: EnvironmentBinding[] }
    | { ok: false; code: 'BAD_REQUEST' | 'NOT_FOUND'; error: string };
  listEnvironmentBindings(nameSpace: string, appName: string): EnvironmentBinding[];
  recordSpecMergeRequest(opts: {
    nameSpace: string;
    appName: string;
    mrUrl: string;
    mrIid: number;
    now?: Date;
  }):
    | { ok: true; draft: ServiceDeploySpecDraftRecord }
    | { ok: false; code: 'NOT_FOUND'; error: string };
  recordPublishedDevJob(opts: {
    nameSpace: string;
    appName: string;
    publishedPinSha: string;
    devJobId: string;
    now?: Date;
  }):
    | { ok: true; draft: ServiceDeploySpecDraftRecord }
    | { ok: false; code: 'NOT_FOUND' | 'BAD_REQUEST'; error: string };
  listEnvironmentPins(nameSpace: string, appName: string): EnvironmentPinRecord[];
  recordHopPin(opts: {
    nameSpace: string;
    appName: string;
    environment: string;
    publishedPinSha: string;
    jobId: string;
    imageTag?: string | null;
    sourceImage?: string | null;
    templateFamily: string;
    now?: Date;
  }):
    | { ok: true; pin: EnvironmentPinRecord }
    | { ok: false; code: 'BAD_REQUEST' | 'NOT_FOUND'; error: string };
  recordHopRunStatus(opts: {
    nameSpace: string;
    appName: string;
    environment: string;
    status: string;
    now?: Date;
  }):
    | { ok: true }
    | { ok: false; code: 'NOT_FOUND'; error: string };
  recordDevValidateRun(opts: {
    nameSpace: string;
    appName: string;
    runId: string;
    status: string;
    now?: Date;
  }):
    | { ok: true; draft: ServiceDeploySpecDraftRecord }
    | { ok: false; code: 'NOT_FOUND'; error: string };
  recordRuntimeCheck(opts: {
    nameSpace: string;
    appName: string;
    runId: string;
    ready: boolean;
    probe: string;
    now?: Date;
  }):
    | { ok: true; draft: ServiceDeploySpecDraftRecord }
    | { ok: false; code: 'NOT_FOUND'; error: string };
  appendBreakGlass(opts: {
    nameSpace: string;
    appName: string;
    hop: string;
    reason: string;
    actor: string;
    rule: BreakGlassRule;
    now?: Date;
  }): { ok: true; entry: BreakGlassEntry } | { ok: false; code: 'BAD_REQUEST' | 'NOT_FOUND'; error: string };
  listBreakGlass(nameSpace: string): BreakGlassEntry[];
};

const NAME_SPACE_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

function iso(d: Date): string {
  return d.toISOString();
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project (
      name_space TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_membership (
      name_space TEXT NOT NULL,
      username TEXT NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (name_space, username),
      FOREIGN KEY (name_space) REFERENCES project(name_space) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS service_deploy_spec_draft (
      name_space TEXT NOT NULL,
      app_name TEXT NOT NULL,
      gitlab_url TEXT NOT NULL,
      promotion_path TEXT NOT NULL,
      template_family TEXT NOT NULL,
      packaging_command TEXT NOT NULL,
      default_ref TEXT NOT NULL,
      k8s_namespace TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      PRIMARY KEY (name_space, app_name),
      FOREIGN KEY (name_space) REFERENCES project(name_space) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS service_deploy_spec_artifacts (
      name_space TEXT NOT NULL,
      app_name TEXT NOT NULL,
      dockerfile_content TEXT NOT NULL,
      dockerfile_dirty INTEGER NOT NULL DEFAULT 0,
      dockerfile_fingerprint TEXT NOT NULL,
      dockerfile_off_catalog INTEGER NOT NULL DEFAULT 0,
      kustomize_base TEXT NOT NULL,
      kustomize_overlays_json TEXT NOT NULL,
      kustomize_dirty INTEGER NOT NULL DEFAULT 0,
      kustomize_fingerprint TEXT NOT NULL,
      base_image TEXT NOT NULL,
      artifact_path TEXT NOT NULL,
      workdir TEXT NOT NULL,
      entrypoint TEXT NOT NULL,
      port INTEGER NOT NULL,
      replicas INTEGER NOT NULL,
      cpu TEXT NOT NULL,
      memory TEXT NOT NULL,
      runtime_env_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      PRIMARY KEY (name_space, app_name),
      FOREIGN KEY (name_space, app_name) REFERENCES service_deploy_spec_draft(name_space, app_name) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS service_deploy_resource_requests (
      name_space TEXT NOT NULL,
      app_name TEXT NOT NULL,
      sheets_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      PRIMARY KEY (name_space, app_name),
      FOREIGN KEY (name_space, app_name) REFERENCES service_deploy_spec_draft(name_space, app_name) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS service_deploy_environment_bindings (
      name_space TEXT NOT NULL,
      app_name TEXT NOT NULL,
      bindings_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      PRIMARY KEY (name_space, app_name),
      FOREIGN KEY (name_space, app_name) REFERENCES service_deploy_spec_draft(name_space, app_name) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS service_deploy_environment_pins (
      name_space TEXT NOT NULL,
      app_name TEXT NOT NULL,
      environment TEXT NOT NULL,
      published_pin_sha TEXT NOT NULL,
      job_id TEXT NOT NULL,
      image_tag TEXT,
      source_image TEXT,
      template_family TEXT NOT NULL,
      last_run_status TEXT,
      last_run_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (name_space, app_name, environment),
      FOREIGN KEY (name_space, app_name) REFERENCES service_deploy_spec_draft(name_space, app_name) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS application_online_break_glass (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_space TEXT NOT NULL,
      app_name TEXT NOT NULL,
      hop TEXT NOT NULL,
      reason TEXT NOT NULL,
      actor TEXT NOT NULL,
      rule TEXT NOT NULL,
      at TEXT NOT NULL,
      FOREIGN KEY (name_space) REFERENCES project(name_space) ON DELETE CASCADE
    );
  `);
  ensureDraftMrColumns(db);
}

function ensureDraftMrColumns(db: DatabaseSync): void {
  const cols = db.prepare(`PRAGMA table_info(service_deploy_spec_draft)`).all() as Array<{
    name: string;
  }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('mr_url')) db.exec(`ALTER TABLE service_deploy_spec_draft ADD COLUMN mr_url TEXT`);
  if (!names.has('mr_iid')) db.exec(`ALTER TABLE service_deploy_spec_draft ADD COLUMN mr_iid INTEGER`);
  if (!names.has('submitted_at')) {
    db.exec(`ALTER TABLE service_deploy_spec_draft ADD COLUMN submitted_at TEXT`);
  }
  if (!names.has('published_pin_sha')) {
    db.exec(`ALTER TABLE service_deploy_spec_draft ADD COLUMN published_pin_sha TEXT`);
  }
  if (!names.has('dev_job_id')) {
    db.exec(`ALTER TABLE service_deploy_spec_draft ADD COLUMN dev_job_id TEXT`);
  }
  if (!names.has('last_dev_run_id')) {
    db.exec(`ALTER TABLE service_deploy_spec_draft ADD COLUMN last_dev_run_id TEXT`);
  }
  if (!names.has('last_dev_run_status')) {
    db.exec(`ALTER TABLE service_deploy_spec_draft ADD COLUMN last_dev_run_status TEXT`);
  }
  if (!names.has('last_dev_run_at')) {
    db.exec(`ALTER TABLE service_deploy_spec_draft ADD COLUMN last_dev_run_at TEXT`);
  }
  if (!names.has('runtime_check_ready')) {
    db.exec(`ALTER TABLE service_deploy_spec_draft ADD COLUMN runtime_check_ready INTEGER`);
  }
  if (!names.has('runtime_check_probe')) {
    db.exec(`ALTER TABLE service_deploy_spec_draft ADD COLUMN runtime_check_probe TEXT`);
  }
  if (!names.has('runtime_check_at')) {
    db.exec(`ALTER TABLE service_deploy_spec_draft ADD COLUMN runtime_check_at TEXT`);
  }
}

type DraftRow = {
  name_space: string;
  app_name: string;
  gitlab_url: string;
  promotion_path: string;
  template_family: string;
  packaging_command: string;
  default_ref: string;
  k8s_namespace: string;
  updated_at: string;
  updated_by: string;
  mr_url: string | null;
  mr_iid: number | null;
  submitted_at: string | null;
  published_pin_sha: string | null;
  dev_job_id: string | null;
  last_dev_run_id: string | null;
  last_dev_run_status: string | null;
  last_dev_run_at: string | null;
  runtime_check_ready: number | null;
  runtime_check_probe: string | null;
  runtime_check_at: string | null;
};

function mapDraft(row: DraftRow): ServiceDeploySpecDraftRecord {
  return {
    nameSpace: row.name_space,
    appName: row.app_name,
    gitlabUrl: row.gitlab_url,
    promotionPath: row.promotion_path as PromotionPath,
    templateFamily: row.template_family as TemplateFamily,
    packagingCommand: row.packaging_command,
    defaultRef: row.default_ref,
    k8sNamespace: row.k8s_namespace,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    publishedPinSha: row.published_pin_sha ?? null,
    mrUrl: row.mr_url ?? null,
    mrIid: row.mr_iid ?? null,
    submittedAt: row.submitted_at ?? null,
    devJobId: row.dev_job_id ?? null,
    lastDevRunId: row.last_dev_run_id ?? null,
    lastDevRunStatus: row.last_dev_run_status ?? null,
    lastDevRunAt: row.last_dev_run_at ?? null,
    runtimeCheckReady:
      row.runtime_check_ready === null || row.runtime_check_ready === undefined
        ? null
        : row.runtime_check_ready === 1,
    runtimeCheckProbe: row.runtime_check_probe ?? null,
    runtimeCheckAt: row.runtime_check_at ?? null,
  };
}

export function openApplicationOnlineStore(dbPath: string): ApplicationOnlineStore {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  let closed = false;

  return {
    close() {
      if (closed) return;
      closed = true;
      db.close();
    },

    createProject(opts) {
      const nameSpace = opts.nameSpace.trim().toLowerCase();
      if (!NAME_SPACE_RE.test(nameSpace)) {
        return {
          ok: false,
          code: 'BAD_REQUEST',
          error: 'NAME_SPACE must be lowercase letters, digits, and hyphens',
        };
      }
      const existing = db.prepare('SELECT name_space FROM project WHERE name_space = ?').get(nameSpace);
      if (existing) return { ok: false, code: 'CONFLICT', error: 'Project already exists' };
      const createdAt = iso(opts.now ?? new Date());
      db.prepare('INSERT INTO project (name_space, created_at) VALUES (?, ?)').run(nameSpace, createdAt);
      return { ok: true, project: { nameSpace, createdAt } };
    },

    listProjects() {
      const rows = db
        .prepare('SELECT name_space, created_at FROM project ORDER BY name_space ASC')
        .all() as { name_space: string; created_at: string }[];
      return rows.map((row) => ({ nameSpace: row.name_space, createdAt: row.created_at }));
    },

    addMembership(opts) {
      const nameSpace = opts.nameSpace.trim().toLowerCase();
      const username = opts.username.trim();
      if (!nameSpace || !username) {
        return { ok: false, code: 'BAD_REQUEST', error: 'Project and Username are required' };
      }
      const project = db.prepare('SELECT name_space FROM project WHERE name_space = ?').get(nameSpace);
      if (!project) return { ok: false, code: 'NOT_FOUND', error: 'Project not found' };
      const existing = db
        .prepare('SELECT username FROM project_membership WHERE name_space = ? AND username = ?')
        .get(nameSpace, username);
      if (existing) return { ok: false, code: 'CONFLICT', error: 'Membership already exists' };
      const addedAt = iso(opts.now ?? new Date());
      db.prepare(
        'INSERT INTO project_membership (name_space, username, added_at) VALUES (?, ?, ?)',
      ).run(nameSpace, username, addedAt);
      return { ok: true };
    },

    removeMembership(opts) {
      const nameSpace = opts.nameSpace.trim().toLowerCase();
      const username = opts.username.trim();
      const result = db
        .prepare('DELETE FROM project_membership WHERE name_space = ? AND username = ?')
        .run(nameSpace, username);
      if (Number(result.changes) === 0) {
        return { ok: false, code: 'NOT_FOUND', error: 'Membership not found' };
      }
      return { ok: true };
    },

    listMemberships(nameSpace) {
      const rows = db
        .prepare(
          `SELECT name_space, username, added_at FROM project_membership
           WHERE name_space = ?
           ORDER BY username ASC`,
        )
        .all(nameSpace.trim().toLowerCase()) as {
        name_space: string;
        username: string;
        added_at: string;
      }[];
      return rows.map((row) => ({
        nameSpace: row.name_space,
        username: row.username,
        addedAt: row.added_at,
      }));
    },

    listAllMemberships() {
      const rows = db
        .prepare(
          `SELECT name_space, username, added_at FROM project_membership
           ORDER BY name_space ASC, username ASC`,
        )
        .all() as { name_space: string; username: string; added_at: string }[];
      return rows.map((row) => ({
        nameSpace: row.name_space,
        username: row.username,
        addedAt: row.added_at,
      }));
    },

    saveSpecDraft(opts) {
      const nameSpace = opts.nameSpace.trim().toLowerCase();
      const appName = opts.appName.trim().toLowerCase();
      const project = db.prepare('SELECT name_space FROM project WHERE name_space = ?').get(nameSpace);
      if (!project) return { ok: false, code: 'NOT_FOUND', error: 'Project not found' };
      if (!nameSpace || !appName || !opts.updatedBy.trim()) {
        return { ok: false, code: 'BAD_REQUEST', error: 'NAME_SPACE, APP_NAME, and updater are required' };
      }
      const updatedAt = iso(opts.now ?? new Date());
      db.prepare(
        `INSERT INTO service_deploy_spec_draft (
           name_space, app_name, gitlab_url, promotion_path, template_family,
           packaging_command, default_ref, k8s_namespace, updated_at, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(name_space, app_name) DO UPDATE SET
           gitlab_url = excluded.gitlab_url,
           promotion_path = excluded.promotion_path,
           template_family = excluded.template_family,
           packaging_command = excluded.packaging_command,
           default_ref = excluded.default_ref,
           k8s_namespace = excluded.k8s_namespace,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`,
      ).run(
        nameSpace,
        appName,
        opts.gitlabUrl,
        opts.promotionPath,
        opts.templateFamily,
        opts.packagingCommand,
        opts.defaultRef,
        opts.k8sNamespace,
        updatedAt,
        opts.updatedBy.trim(),
      );
      const draft = storeGetDraft(db, nameSpace, appName);
      if (!draft) return { ok: false, code: 'BAD_REQUEST', error: 'Failed to persist draft' };
      return { ok: true, draft };
    },

    getSpecDraft(nameSpace, appName) {
      return storeGetDraft(db, nameSpace.trim().toLowerCase(), appName.trim().toLowerCase());
    },

    listSpecDrafts(nameSpace) {
      const rows = db
        .prepare(
          `SELECT name_space, app_name, gitlab_url, promotion_path, template_family,
                  packaging_command, default_ref, k8s_namespace, updated_at, updated_by,
                  mr_url, mr_iid, submitted_at, published_pin_sha, dev_job_id,
                  last_dev_run_id, last_dev_run_status, last_dev_run_at,
                  runtime_check_ready, runtime_check_probe, runtime_check_at
           FROM service_deploy_spec_draft
           WHERE name_space = ?
           ORDER BY app_name ASC`,
        )
        .all(nameSpace.trim().toLowerCase()) as DraftRow[];
      return rows.map(mapDraft);
    },

    saveSpecArtifacts(opts) {
      const nameSpace = opts.nameSpace.trim().toLowerCase();
      const appName = opts.appName.trim().toLowerCase();
      const draft = storeGetDraft(db, nameSpace, appName);
      if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };
      if (!opts.updatedBy.trim()) {
        return { ok: false, code: 'BAD_REQUEST', error: 'updater is required' };
      }
      const updatedAt = iso(opts.now ?? new Date());
      db.prepare(
        `INSERT INTO service_deploy_spec_artifacts (
           name_space, app_name,
           dockerfile_content, dockerfile_dirty, dockerfile_fingerprint, dockerfile_off_catalog,
           kustomize_base, kustomize_overlays_json, kustomize_dirty, kustomize_fingerprint,
           base_image, artifact_path, workdir, entrypoint, port, replicas, cpu, memory, runtime_env_json,
           updated_at, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(name_space, app_name) DO UPDATE SET
           dockerfile_content = excluded.dockerfile_content,
           dockerfile_dirty = excluded.dockerfile_dirty,
           dockerfile_fingerprint = excluded.dockerfile_fingerprint,
           dockerfile_off_catalog = excluded.dockerfile_off_catalog,
           kustomize_base = excluded.kustomize_base,
           kustomize_overlays_json = excluded.kustomize_overlays_json,
           kustomize_dirty = excluded.kustomize_dirty,
           kustomize_fingerprint = excluded.kustomize_fingerprint,
           base_image = excluded.base_image,
           artifact_path = excluded.artifact_path,
           workdir = excluded.workdir,
           entrypoint = excluded.entrypoint,
           port = excluded.port,
           replicas = excluded.replicas,
           cpu = excluded.cpu,
           memory = excluded.memory,
           runtime_env_json = excluded.runtime_env_json,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`,
      ).run(
        nameSpace,
        appName,
        opts.dockerfile.content,
        opts.dockerfile.dirty ? 1 : 0,
        opts.dockerfile.fieldsFingerprint,
        opts.dockerfile.offCatalogFromWarning ? 1 : 0,
        opts.kustomize.base,
        opts.kustomize.overlaysJson,
        opts.kustomize.dirty ? 1 : 0,
        opts.kustomize.fieldsFingerprint,
        opts.generateFields.baseImage,
        opts.generateFields.artifactPath,
        opts.generateFields.workdir,
        opts.generateFields.entrypoint,
        opts.generateFields.port,
        opts.generateFields.replicas,
        opts.generateFields.cpu,
        opts.generateFields.memory,
        opts.generateFields.runtimeEnvJson,
        updatedAt,
        opts.updatedBy.trim(),
      );
      const artifacts = storeGetArtifacts(db, nameSpace, appName);
      if (!artifacts) return { ok: false, code: 'BAD_REQUEST', error: 'Failed to persist artifacts' };
      return { ok: true, artifacts };
    },

    getSpecArtifacts(nameSpace, appName) {
      return storeGetArtifacts(db, nameSpace.trim().toLowerCase(), appName.trim().toLowerCase());
    },

    saveResourceRequests(opts) {
      const nameSpace = opts.nameSpace.trim().toLowerCase();
      const appName = opts.appName.trim().toLowerCase();
      const draft = storeGetDraft(db, nameSpace, appName);
      if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };
      if (!opts.updatedBy.trim()) {
        return { ok: false, code: 'BAD_REQUEST', error: 'updater is required' };
      }
      const updatedAt = iso(opts.now ?? new Date());
      const sheetsJson = JSON.stringify(opts.sheets);
      db.prepare(
        `INSERT INTO service_deploy_resource_requests (
           name_space, app_name, sheets_json, updated_at, updated_by
         ) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(name_space, app_name) DO UPDATE SET
           sheets_json = excluded.sheets_json,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`,
      ).run(nameSpace, appName, sheetsJson, updatedAt, opts.updatedBy.trim());
      return { ok: true, sheets: opts.sheets };
    },

    getResourceRequests(nameSpace, appName) {
      const row = db
        .prepare(
          `SELECT sheets_json FROM service_deploy_resource_requests
           WHERE name_space = ? AND app_name = ?`,
        )
        .get(nameSpace.trim().toLowerCase(), appName.trim().toLowerCase()) as
        | { sheets_json: string }
        | undefined;
      if (!row) return null;
      try {
        return JSON.parse(row.sheets_json) as ResourceRequestSheet[];
      } catch {
        return null;
      }
    },

    saveEnvironmentBindings(opts) {
      const nameSpace = opts.nameSpace.trim().toLowerCase();
      const appName = opts.appName.trim().toLowerCase();
      const draft = storeGetDraft(db, nameSpace, appName);
      if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };
      if (!opts.updatedBy.trim()) {
        return { ok: false, code: 'BAD_REQUEST', error: 'updater is required' };
      }
      const bindings = normalizeEnvironmentBindings(opts.bindings);
      const updatedAt = iso(opts.now ?? new Date());
      db.prepare(
        `INSERT INTO service_deploy_environment_bindings (
           name_space, app_name, bindings_json, updated_at, updated_by
         ) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(name_space, app_name) DO UPDATE SET
           bindings_json = excluded.bindings_json,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`,
      ).run(nameSpace, appName, JSON.stringify(bindings), updatedAt, opts.updatedBy.trim());
      return { ok: true, bindings };
    },

    listEnvironmentBindings(nameSpace, appName) {
      const row = db
        .prepare(
          `SELECT bindings_json FROM service_deploy_environment_bindings
           WHERE name_space = ? AND app_name = ?`,
        )
        .get(nameSpace.trim().toLowerCase(), appName.trim().toLowerCase()) as
        | { bindings_json: string }
        | undefined;
      if (!row) return [];
      try {
        return normalizeEnvironmentBindings(JSON.parse(row.bindings_json) as EnvironmentBinding[]);
      } catch {
        return [];
      }
    },

    recordSpecMergeRequest(opts) {
      const nameSpace = opts.nameSpace.trim().toLowerCase();
      const appName = opts.appName.trim().toLowerCase();
      const submittedAt = iso(opts.now ?? new Date());
      const result = db
        .prepare(
          `UPDATE service_deploy_spec_draft
           SET mr_url = ?, mr_iid = ?, submitted_at = ?
           WHERE name_space = ? AND app_name = ?`,
        )
        .run(opts.mrUrl, opts.mrIid, submittedAt, nameSpace, appName);
      if (Number(result.changes) === 0) {
        return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };
      }
      const draft = storeGetDraft(db, nameSpace, appName);
      if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };
      return { ok: true, draft };
    },

    recordPublishedDevJob(opts) {
      const nameSpace = opts.nameSpace.trim().toLowerCase();
      const appName = opts.appName.trim().toLowerCase();
      const sha = opts.publishedPinSha.trim();
      if (!sha) return { ok: false, code: 'BAD_REQUEST', error: 'Published SHA is required' };
      const draft = storeGetDraft(db, nameSpace, appName);
      if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };
      const result = db
        .prepare(
          `UPDATE service_deploy_spec_draft
           SET published_pin_sha = ?, dev_job_id = ?
           WHERE name_space = ? AND app_name = ?`,
        )
        .run(sha, opts.devJobId, nameSpace, appName);
      if (Number(result.changes) === 0) {
        return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };
      }
      upsertPin(db, {
        nameSpace,
        appName,
        environment: 'dev',
        publishedPinSha: sha,
        jobId: opts.devJobId,
        imageTag: null,
        sourceImage: null,
        templateFamily: draft.templateFamily,
        now: opts.now,
      });
      const updated = storeGetDraft(db, nameSpace, appName);
      if (!updated) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };
      return { ok: true, draft: updated };
    },

    listEnvironmentPins(nameSpace, appName) {
      const rows = db
        .prepare(
          `SELECT environment, published_pin_sha, job_id, image_tag, source_image,
                  template_family, last_run_status
           FROM service_deploy_environment_pins
           WHERE name_space = ? AND app_name = ?
           ORDER BY environment ASC`,
        )
        .all(nameSpace.trim().toLowerCase(), appName.trim().toLowerCase()) as Array<{
        environment: string;
        published_pin_sha: string;
        job_id: string;
        image_tag: string | null;
        source_image: string | null;
        template_family: string;
        last_run_status: string | null;
      }>;
      return rows.map((row) => ({
        environment: row.environment,
        publishedPinSha: row.published_pin_sha,
        jobId: row.job_id,
        imageTag: row.image_tag,
        sourceImage: row.source_image,
        templateFamily: row.template_family,
        lastRunStatus: row.last_run_status,
      }));
    },

    recordHopPin(opts) {
      const nameSpace = opts.nameSpace.trim().toLowerCase();
      const appName = opts.appName.trim().toLowerCase();
      const environment = opts.environment.trim().toLowerCase();
      const sha = opts.publishedPinSha.trim();
      const jobId = opts.jobId.trim();
      if (!sha || !jobId || !environment) {
        return { ok: false, code: 'BAD_REQUEST', error: 'environment, SHA, and jobId are required' };
      }
      const draft = storeGetDraft(db, nameSpace, appName);
      if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };
      const pin = upsertPin(db, {
        nameSpace,
        appName,
        environment,
        publishedPinSha: sha,
        jobId,
        imageTag: opts.imageTag ?? null,
        sourceImage: opts.sourceImage ?? null,
        templateFamily: opts.templateFamily,
        now: opts.now,
      });
      return { ok: true, pin };
    },

    recordHopRunStatus(opts) {
      const nameSpace = opts.nameSpace.trim().toLowerCase();
      const appName = opts.appName.trim().toLowerCase();
      const environment = opts.environment.trim().toLowerCase();
      const at = iso(opts.now ?? new Date());
      const result = db
        .prepare(
          `UPDATE service_deploy_environment_pins
           SET last_run_status = ?, last_run_at = ?, updated_at = ?
           WHERE name_space = ? AND app_name = ? AND environment = ?`,
        )
        .run(opts.status, at, at, nameSpace, appName, environment);
      if (Number(result.changes) === 0) {
        return { ok: false, code: 'NOT_FOUND', error: 'Environment pin not found' };
      }
      return { ok: true };
    },

    recordDevValidateRun(opts) {
      const nameSpace = opts.nameSpace.trim().toLowerCase();
      const appName = opts.appName.trim().toLowerCase();
      const at = iso(opts.now ?? new Date());
      const draft = storeGetDraft(db, nameSpace, appName);
      if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };
      const result = db
        .prepare(
          `UPDATE service_deploy_spec_draft
           SET last_dev_run_id = ?, last_dev_run_status = ?, last_dev_run_at = ?
           WHERE name_space = ? AND app_name = ?`,
        )
        .run(opts.runId, opts.status, at, nameSpace, appName);
      if (Number(result.changes) === 0) {
        return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };
      }
      if (opts.status === 'success_apply' && draft.devJobId && draft.publishedPinSha) {
        upsertPin(db, {
          nameSpace,
          appName,
          environment: 'dev',
          publishedPinSha: draft.publishedPinSha,
          jobId: draft.devJobId,
          imageTag: null,
          sourceImage: null,
          templateFamily: draft.templateFamily,
          now: opts.now,
          lastRunStatus: opts.status,
        });
      }
      const updated = storeGetDraft(db, nameSpace, appName);
      if (!updated) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };
      return { ok: true, draft: updated };
    },

    recordRuntimeCheck(opts) {
      const nameSpace = opts.nameSpace.trim().toLowerCase();
      const appName = opts.appName.trim().toLowerCase();
      const at = iso(opts.now ?? new Date());
      const result = db
        .prepare(
          `UPDATE service_deploy_spec_draft
           SET runtime_check_ready = ?, runtime_check_probe = ?, runtime_check_at = ?
           WHERE name_space = ? AND app_name = ?`,
        )
        .run(opts.ready ? 1 : 0, opts.probe, at, nameSpace, appName);
      if (Number(result.changes) === 0) {
        return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };
      }
      const draft = storeGetDraft(db, nameSpace, appName);
      if (!draft) return { ok: false, code: 'NOT_FOUND', error: 'Spec draft not found' };
      return { ok: true, draft };
    },

    appendBreakGlass(opts) {
      const nameSpace = opts.nameSpace.trim().toLowerCase();
      const appName = opts.appName.trim().toLowerCase();
      const hop = opts.hop.trim().toLowerCase();
      const reason = opts.reason.trim();
      const actor = opts.actor.trim();
      if (!nameSpace || !appName || !hop || !reason || !actor) {
        return { ok: false, code: 'BAD_REQUEST', error: 'Break-glass fields are required' };
      }
      const project = db.prepare('SELECT name_space FROM project WHERE name_space = ?').get(nameSpace);
      if (!project) return { ok: false, code: 'NOT_FOUND', error: 'Project not found' };
      const entry = recordBreakGlassSkip({
        nameSpace,
        appName,
        hop,
        reason,
        actor,
        rule: opts.rule,
        at: opts.now,
      });
      db.prepare(
        `INSERT INTO application_online_break_glass
           (name_space, app_name, hop, reason, actor, rule, at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        entry.nameSpace,
        entry.appName,
        entry.hop,
        entry.reason,
        entry.actor,
        entry.rule,
        entry.at,
      );
      return { ok: true, entry };
    },

    listBreakGlass(nameSpace) {
      const rows = db
        .prepare(
          `SELECT name_space, app_name, hop, reason, actor, rule, at
           FROM application_online_break_glass
           WHERE name_space = ?
           ORDER BY at DESC, id DESC`,
        )
        .all(nameSpace.trim().toLowerCase()) as Array<{
        name_space: string;
        app_name: string;
        hop: string;
        reason: string;
        actor: string;
        rule: string;
        at: string;
      }>;
      return rows.map((row) => ({
        nameSpace: row.name_space,
        appName: row.app_name,
        hop: row.hop,
        reason: row.reason,
        actor: row.actor,
        rule: row.rule as BreakGlassRule,
        at: row.at,
        becomesDefaultPath: false as const,
      }));
    },
  };
}

function upsertPin(
  db: DatabaseSync,
  opts: {
    nameSpace: string;
    appName: string;
    environment: string;
    publishedPinSha: string;
    jobId: string;
    imageTag: string | null;
    sourceImage: string | null;
    templateFamily: string;
    now?: Date;
    lastRunStatus?: string | null;
  },
): EnvironmentPinRecord {
  const updatedAt = iso(opts.now ?? new Date());
  const existing = db
    .prepare(
      `SELECT last_run_status FROM service_deploy_environment_pins
       WHERE name_space = ? AND app_name = ? AND environment = ?`,
    )
    .get(opts.nameSpace, opts.appName, opts.environment) as
    | { last_run_status: string | null }
    | undefined;
  const lastRunStatus =
    opts.lastRunStatus !== undefined
      ? opts.lastRunStatus
      : (existing?.last_run_status ?? null);
  db.prepare(
    `INSERT INTO service_deploy_environment_pins (
       name_space, app_name, environment, published_pin_sha, job_id,
       image_tag, source_image, template_family, last_run_status, last_run_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(name_space, app_name, environment) DO UPDATE SET
       published_pin_sha = excluded.published_pin_sha,
       job_id = excluded.job_id,
       image_tag = excluded.image_tag,
       source_image = excluded.source_image,
       template_family = excluded.template_family,
       last_run_status = excluded.last_run_status,
       last_run_at = CASE
         WHEN excluded.last_run_status IS NOT NULL THEN excluded.updated_at
         ELSE service_deploy_environment_pins.last_run_at
       END,
       updated_at = excluded.updated_at`,
  ).run(
    opts.nameSpace,
    opts.appName,
    opts.environment,
    opts.publishedPinSha,
    opts.jobId,
    opts.imageTag,
    opts.sourceImage,
    opts.templateFamily,
    lastRunStatus,
    lastRunStatus ? updatedAt : null,
    updatedAt,
  );
  return {
    environment: opts.environment,
    publishedPinSha: opts.publishedPinSha,
    jobId: opts.jobId,
    imageTag: opts.imageTag,
    sourceImage: opts.sourceImage,
    templateFamily: opts.templateFamily,
    lastRunStatus,
  };
}

function storeGetDraft(
  db: DatabaseSync,
  nameSpace: string,
  appName: string,
): ServiceDeploySpecDraftRecord | null {
  const row = db
    .prepare(
      `SELECT name_space, app_name, gitlab_url, promotion_path, template_family,
              packaging_command, default_ref, k8s_namespace, updated_at, updated_by,
              mr_url, mr_iid, submitted_at, published_pin_sha, dev_job_id,
              last_dev_run_id, last_dev_run_status, last_dev_run_at,
              runtime_check_ready, runtime_check_probe, runtime_check_at
       FROM service_deploy_spec_draft
       WHERE name_space = ? AND app_name = ?`,
    )
    .get(nameSpace, appName) as DraftRow | undefined;
  return row ? mapDraft(row) : null;
}

type ArtifactRow = {
  name_space: string;
  app_name: string;
  dockerfile_content: string;
  dockerfile_dirty: number;
  dockerfile_fingerprint: string;
  dockerfile_off_catalog: number;
  kustomize_base: string;
  kustomize_overlays_json: string;
  kustomize_dirty: number;
  kustomize_fingerprint: string;
  base_image: string;
  artifact_path: string;
  workdir: string;
  entrypoint: string;
  port: number;
  replicas: number;
  cpu: string;
  memory: string;
  runtime_env_json: string;
  updated_at: string;
  updated_by: string;
};

function storeGetArtifacts(
  db: DatabaseSync,
  nameSpace: string,
  appName: string,
): SpecArtifactsRecord | null {
  const row = db
    .prepare(
      `SELECT name_space, app_name,
              dockerfile_content, dockerfile_dirty, dockerfile_fingerprint, dockerfile_off_catalog,
              kustomize_base, kustomize_overlays_json, kustomize_dirty, kustomize_fingerprint,
              base_image, artifact_path, workdir, entrypoint, port, replicas, cpu, memory, runtime_env_json,
              updated_at, updated_by
       FROM service_deploy_spec_artifacts
       WHERE name_space = ? AND app_name = ?`,
    )
    .get(nameSpace, appName) as ArtifactRow | undefined;
  if (!row) return null;
  return {
    nameSpace: row.name_space,
    appName: row.app_name,
    dockerfile: {
      content: row.dockerfile_content,
      dirty: row.dockerfile_dirty === 1,
      fieldsFingerprint: row.dockerfile_fingerprint,
      offCatalogFromWarning: row.dockerfile_off_catalog === 1,
    },
    kustomize: {
      base: row.kustomize_base,
      overlaysJson: row.kustomize_overlays_json,
      dirty: row.kustomize_dirty === 1,
      fieldsFingerprint: row.kustomize_fingerprint,
    },
    generateFields: {
      baseImage: row.base_image,
      artifactPath: row.artifact_path,
      workdir: row.workdir,
      entrypoint: row.entrypoint,
      port: row.port,
      replicas: row.replicas,
      cpu: row.cpu,
      memory: row.memory,
      runtimeEnvJson: row.runtime_env_json,
    },
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

const DEFAULT_DB = path.join(process.cwd(), '.data', 'application-online.sqlite');

let singleton: ApplicationOnlineStore | null = null;

export function getApplicationOnlineStore(opts?: { dbPath?: string }): ApplicationOnlineStore {
  if (singleton) return singleton;
  singleton = openApplicationOnlineStore(opts?.dbPath ?? DEFAULT_DB);
  return singleton;
}

export function _resetApplicationOnlineStoreForTests(): void {
  if (singleton) {
    try {
      singleton.close();
    } catch {
      /* ignore */
    }
  }
  singleton = null;
}
