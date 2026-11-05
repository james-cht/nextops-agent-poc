export type ConfigAuditOutcome = 'saved' | 'rejected' | 'test_failed' | 'restored';

export type ConfigAuditEntry = {
  ts: string;
  action: 'save' | 'restore';
  setting: string;
  outcome: ConfigAuditOutcome;
  actor: string;
  detail?: Record<string, unknown>;
};

export type ConfigAuditStore = {
  appendAudit(entry: Omit<ConfigAuditEntry, 'ts'> & { ts?: string }): ConfigAuditEntry;
  listAudit(limit?: number): ConfigAuditEntry[];
};

export type ConfigAuditOpts = {
  dataDir?: string;
  store?: ConfigAuditStore;
  logLine?: (line: string) => void;
};

export function appendConfigAuditEntry(
  entry: Omit<ConfigAuditEntry, 'ts'> & { ts?: string },
  opts: ConfigAuditOpts = {},
): ConfigAuditEntry {
  let full: ConfigAuditEntry;
  if (opts.store) {
    full = opts.store.appendAudit(entry);
  } else {
    // Fallback for unit tests without a store: in-memory only via logLine
    full = {
      ts: entry.ts ?? new Date().toISOString(),
      action: entry.action,
      setting: entry.setting,
      outcome: entry.outcome,
      actor: entry.actor,
      detail: entry.detail,
    };
  }
  const emit = opts.logLine ?? ((s: string) => console.info(s));
  emit(JSON.stringify({ message: 'config_audit', ...full }));
  return full;
}

export function listConfigAuditEntries(
  opts: ConfigAuditOpts & { limit?: number } = {},
): ConfigAuditEntry[] {
  if (opts.store) return opts.store.listAudit(opts.limit ?? 100);
  return [];
}

export function _resetConfigAuditForTests(): void {
  /* store-backed */
}
