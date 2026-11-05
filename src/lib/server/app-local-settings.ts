import { env } from '$env/dynamic/private';
import {
  ensureAdminSeeded,
  getLocalSettingsStore,
  type LocalSettingsStore,
} from '$lib/server/local-settings-store';
import { verifyStepUpAgainstStore } from '$lib/server/step-up-password';

let ready: Promise<LocalSettingsStore> | null = null;

/** Open Local Settings Store, import legacy `.data` JSON once, seed Admin Credential once. */
export function ensureAppLocalSettings(): Promise<LocalSettingsStore> {
  if (!ready) {
    ready = (async () => {
      const store = getLocalSettingsStore();
      await ensureAdminSeeded(store, {
        username: env.NEXTOPS_ADMIN_USER ?? 'admin',
        password: env.NEXTOPS_ADMIN_PASS ?? '',
      });
      return store;
    })();
  }
  return ready;
}

export { verifyStepUpAgainstStore } from '$lib/server/step-up-password';

export async function verifyStepUpPassword(password: string): Promise<boolean> {
  const store = await ensureAppLocalSettings();
  return verifyStepUpAgainstStore(store, password);
}

export async function verifyLoginCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  const store = await ensureAppLocalSettings();
  if (await store.verifyOperatorPassword(username, password)) return true;
  return store.verifyAdmin(username, password);
}

/** Test helper */
export function _resetAppLocalSettingsForTests(): void {
  ready = null;
}
