import type { ConfigAuditStore } from './config-audit-log.ts';
import { appendConfigAuditEntry } from './config-audit-log.ts';

export type MysqlProxyApplyResult =
  | { ok: true; enabled: boolean }
  | { ok: false; code: 'UNAUTHORIZED'; error: string };

export type MysqlProxyAdminDeps = {
  adminPassword: string;
  verifyStepUp: (password: string) => Promise<boolean>;
  actor: string;
  enabled: boolean;
  store?: ConfigAuditStore;
  logLine?: (line: string) => void;
  setEnabled: (enabled: boolean) => void;
  getEnabled: () => boolean;
};

export async function applyMysqlProxySave(
  opts: MysqlProxyAdminDeps,
): Promise<MysqlProxyApplyResult> {
  const ok = await opts.verifyStepUp(opts.adminPassword);
  if (!ok) {
    appendConfigAuditEntry(
      {
        action: 'save',
        setting: 'mysql_proxy',
        outcome: 'rejected',
        actor: opts.actor,
        detail: { reason: 'bad_password' },
      },
      { store: opts.store, logLine: opts.logLine },
    );
    return { ok: false, code: 'UNAUTHORIZED', error: 'Admin password required' };
  }

  opts.setEnabled(opts.enabled);
  appendConfigAuditEntry(
    {
      action: 'save',
      setting: 'mysql_proxy',
      outcome: 'saved',
      actor: opts.actor,
      detail: { enabled: opts.enabled },
    },
    { store: opts.store, logLine: opts.logLine },
  );
  return { ok: true, enabled: opts.getEnabled() };
}
