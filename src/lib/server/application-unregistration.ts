import { canUnregisterApplication } from '../application-catalog.ts';
import type { ApplicationStore } from './application-store.ts';
import type { LocalSettingsStore } from './local-settings-store.ts';

export type UnregisterApplicationResult =
  | { ok: true }
  | {
      ok: false;
      code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'BAD_REQUEST' | 'NOT_FOUND';
      error: string;
    };

/** Catalog-only delete — never talks to GitLab. */
export function unregisterApplication(opts: {
  operatorKey: string | null | undefined;
  settings: LocalSettingsStore;
  apps: ApplicationStore;
  name: string;
}): UnregisterApplicationResult {
  const key = opts.operatorKey?.trim();
  if (!key) return { ok: false, code: 'UNAUTHORIZED', error: 'Session required' };
  const account = opts.settings.getOperatorAccount(key);
  if (!account || account.disabled) {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Session required' };
  }
  if (!canUnregisterApplication(account.role)) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      error: 'Application Unregistration is not allowed for this role',
    };
  }
  const name = opts.name.trim();
  if (!name) {
    return { ok: false, code: 'BAD_REQUEST', error: 'Application name is required' };
  }
  const deleted = opts.apps.unregisterApplication(name);
  if (!deleted.ok) {
    return { ok: false, code: deleted.code, error: deleted.error };
  }
  return { ok: true };
}
