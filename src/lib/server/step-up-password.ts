import type { LocalSettingsStore } from './local-settings-store.ts';

/**
 * Runtime Setting step-up: accept leftover admin_credential (transitional) or any
 * enabled Platform Owner Lasting Password. Login no longer uses admin_credential;
 * Operators who changed their lasting password must still be able to confirm.
 */
export async function verifyStepUpAgainstStore(
  store: LocalSettingsStore,
  password: string,
): Promise<boolean> {
  if (!password) return false;
  const adminUser = store.getAdminUsername();
  if (adminUser && (await store.verifyAdmin(adminUser, password))) return true;
  for (const account of store.listOperatorAccounts()) {
    if (account.disabled || account.role !== 'platform_owner') continue;
    if (await store.verifyOperatorPassword(account.username, password)) return true;
  }
  return false;
}
