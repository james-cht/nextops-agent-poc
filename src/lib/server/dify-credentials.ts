import path from 'node:path';
import {
  resolveDifyCredentials,
  type DifyCredentialSnapshot,
  type DifyCredentialValues,
} from '../dify-credentials-policy.ts';
import {
  getLocalSettingsStore,
  openLocalSettingsStore,
  type LocalSettingsStore,
  _resetLocalSettingsSingletonForTests,
} from './local-settings-store.ts';

export type DifyOverrideStore = Pick<
  LocalSettingsStore,
  'getDifyOverride' | 'setDifyOverride' | 'clearDifyOverride'
>;

export type DifyCredentialsStoreOpts = {
  env: DifyCredentialValues;
  /** Prefer injecting a store in tests; otherwise process singleton. */
  store?: DifyOverrideStore;
  /**
   * @deprecated Prefer `store`. When set without store, opens sqlite under this dir for tests.
   */
  dataDir?: string;
};

const testStores = new Map<string, LocalSettingsStore>();

function resolveStore(opts: { store?: DifyOverrideStore; dataDir?: string }): DifyOverrideStore {
  if (opts.store) return opts.store;
  if (opts.dataDir) {
    let s = testStores.get(opts.dataDir);
    if (!s) {
      s = openLocalSettingsStore(path.join(opts.dataDir, 'nextops.sqlite'));
      testStores.set(opts.dataDir, s);
    }
    return s;
  }
  return getLocalSettingsStore();
}

/** Map process env / private SvelteKit env into credential values.
 * Dify Chat Credentials (`DIFY_BASE_URL`, `DIFY_API_KEY`) are retired (ADR-0023).
 * Only the Tool Endpoint Token is live.
 */
export function envValuesFromProcess(env: {
  DIFY_BASE_URL?: string;
  DIFY_API_KEY?: string;
  NEXTOPS_DIFY_TOKEN?: string;
}): DifyCredentialValues {
  return {
    baseUrl: '',
    apiKey: '',
    toolToken: env.NEXTOPS_DIFY_TOKEN || '',
  };
}

export function getEnvDifyCredentials(env: DifyCredentialValues): DifyCredentialValues {
  return { ...env };
}

export function getEffectiveDifyCredentials(
  opts: DifyCredentialsStoreOpts,
): DifyCredentialSnapshot {
  const store = resolveStore(opts);
  return resolveDifyCredentials({
    env: getEnvDifyCredentials(opts.env),
    override: store.getDifyOverride(),
  });
}

export function setDifyCredentialOverride(
  values: DifyCredentialValues,
  opts: { store?: DifyOverrideStore; dataDir?: string } = {},
): void {
  resolveStore(opts).setDifyOverride(values);
}

export function clearDifyCredentialOverride(
  opts: { store?: DifyOverrideStore; dataDir?: string } = {},
): void {
  resolveStore(opts).clearDifyOverride();
}

/** Test helper — resets process singleton and per-dataDir test stores. */
export function _resetDifyCredentialsStoreForTests(): void {
  _resetLocalSettingsSingletonForTests();
  for (const s of testStores.values()) {
    try {
      s.close();
    } catch {
      /* */
    }
  }
  testStores.clear();
}
