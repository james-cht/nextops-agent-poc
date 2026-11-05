import type { ApplicationRecord, ApplicationStore } from './application-store.ts';
import type { LocalSettingsStore } from './local-settings-store.ts';

export type CatalogListOk = {
  ok: true;
  applications: ApplicationRecord[];
};

export type CatalogListErr = {
  ok: false;
  code: 'UNAUTHORIZED';
  error: string;
};

export type CatalogListResult = CatalogListOk | CatalogListErr;

/** Session-authenticated Application Catalog list — any non-disabled Operator Account. */
export function listApplicationCatalog(opts: {
  operatorKey: string | null | undefined;
  settings: LocalSettingsStore;
  apps: ApplicationStore;
}): CatalogListResult {
  const key = opts.operatorKey?.trim();
  if (!key) {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Session required' };
  }
  const account = opts.settings.getOperatorAccount(key);
  if (!account || account.disabled) {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Session required' };
  }
  return { ok: true, applications: opts.apps.listApplications() };
}
