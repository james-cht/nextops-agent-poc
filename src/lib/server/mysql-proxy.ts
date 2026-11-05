import { env } from '$env/dynamic/public';
import { resolveMysqlProxyEnabled } from '$lib/server/mysql-proxy-policy';
import { getLocalSettingsStore } from '$lib/server/local-settings-store';

export { resolveMysqlProxyEnabled } from '$lib/server/mysql-proxy-policy';

function envDefaultEnabled(): boolean {
  return env.PUBLIC_MYSQL_PROXY_ENABLED === 'true';
}

/** Admin-facing flag (env default false, may be overridden by Local Settings Store). */
export function getMysqlProxyEnabledPreference(): boolean {
  const fromStore = getLocalSettingsStore().getMysqlProxyEnabled();
  if (fromStore !== null) return fromStore;
  return envDefaultEnabled();
}

/**
 * Whether MySQL connections should use HTTP CONNECT via PUBLIC_DEFAULT_PROXY_*.
 * Defaults to direct TCP. Independent of PUBLIC_DEFAULT_PROXY_ENABLED (fetch/Prom/ES).
 */
export function isMysqlProxyEnabled(): boolean {
  return resolveMysqlProxyEnabled({
    flag: getMysqlProxyEnabledPreference(),
    proxyHost: env.PUBLIC_DEFAULT_PROXY_HOST ?? '',
    proxyPort: env.PUBLIC_DEFAULT_PROXY_PORT ?? '',
  });
}

/** Persist admin toggle; next new pool connections use the updated transport. */
export function setMysqlProxyEnabled(enabled: boolean): void {
  getLocalSettingsStore().setMysqlProxyEnabled(enabled);
}
