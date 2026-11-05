import { EnvHttpProxyAgent, setGlobalDispatcher, type Dispatcher } from 'undici';
import { SITE_CONFIGS } from '$lib/site-config';
import { PROMETHEUS_FETCH_TIMEOUT_MS } from '$lib/prometheus-query';
import { resolveNoProxy } from '$lib/server/proxy-no-proxy';
import { isProductionProxyMisconfiguration as detectProductionProxyMisconfiguration } from '$lib/server/proxy-policy';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';

let proxyAgent: Dispatcher | null = null;

export { resolveNoProxy } from '$lib/server/proxy-no-proxy';

export function isProxyEnabled(): boolean {
  const proxyEnabled = env.PUBLIC_DEFAULT_PROXY_ENABLED;
  const proxyHost = env.PUBLIC_DEFAULT_PROXY_HOST;
  const proxyPort = env.PUBLIC_DEFAULT_PROXY_PORT;
  return (
    proxyEnabled === 'true' &&
    !!proxyHost &&
    !!proxyPort
  );
}

export function isProductionProxyMisconfiguration(): boolean {
  return detectProductionProxyMisconfiguration(process.env.NODE_ENV, isProxyEnabled());
}

/** When false, internal site Prometheus/ES hosts route through the corporate proxy (laptop dev). */
export function shouldBypassSiteHostsInNoProxy(): boolean {
  const override = env.PUBLIC_DEFAULT_PROXY_BYPASS_SITE_HOSTS;
  if (override === 'false') return false;
  if (override === 'true') return true;
  return true;
}

export function getNoProxyList(): string {
  return resolveNoProxy(SITE_CONFIGS, {
    bypassSiteHosts: shouldBypassSiteHostsInNoProxy(),
    // ES and the Diagnosis Orchestrator are not site-config hosts; without these
    // extra URLs, Smart Logging / OPSGPT hairpin the corporate proxy.
    extraUrls: [privateEnv.ES_BASE_URL, env.PUBLIC_DEFAULT_ELASTICSEARCH_URL, privateEnv.ORCH_BASE_URL],
  });
}

export function getProxyAgent(): Dispatcher | null {
  if (!isProxyEnabled()) return null;
  const proxyHost = env.PUBLIC_DEFAULT_PROXY_HOST;
  const proxyPort = env.PUBLIC_DEFAULT_PROXY_PORT;
  if (!proxyAgent) {
    proxyAgent = new EnvHttpProxyAgent({
      httpProxy: `http://${proxyHost}:${proxyPort}`,
      noProxy: getNoProxyList(),
      proxyTunnel: true,
      connectTimeout: PROMETHEUS_FETCH_TIMEOUT_MS,
      bodyTimeout: PROMETHEUS_FETCH_TIMEOUT_MS,
      headersTimeout: PROMETHEUS_FETCH_TIMEOUT_MS,
    });
  }
  return proxyAgent;
}

/** Register undici global dispatcher so bare `fetch()` also uses the proxy. */
export function initGlobalProxy(): void {
  if (!isProxyEnabled()) return;

  const agent = getProxyAgent();
  if (!agent) return;

  const noProxy = getNoProxyList();
  const bypassSiteHosts = shouldBypassSiteHostsInNoProxy();
  const productionProxyWarning = isProductionProxyMisconfiguration();
  try {
    console.error(JSON.stringify({
      type: 'proxy_init',
      ts: new Date().toISOString(),
      severity: productionProxyWarning ? 'warn' : 'info',
      proxyEnabled: true,
      proxyHost: env.PUBLIC_DEFAULT_PROXY_HOST,
      proxyPort: env.PUBLIC_DEFAULT_PROXY_PORT,
      noProxy,
      bypassSiteHosts,
      siteCount: Object.keys(SITE_CONFIGS).length,
      source: 'NEXTOPS_SITES_CONFIG or site-config.json',
      ...(productionProxyWarning
        ? {
            warning:
              'PUBLIC_DEFAULT_PROXY_ENABLED=true in NODE_ENV=production violates Direct Upstream Access; set proxy to false for production deployments with direct network reachability',
          }
        : {}),
    }));
  } catch {
    console.error('[proxy_init] proxy enabled; failed to serialize no_proxy diagnostic');
  }

  if (productionProxyWarning) {
    console.error(
      '[proxy_init][WARN] Production deploy has HTTP proxy enabled. Set PUBLIC_DEFAULT_PROXY_ENABLED=false when upstream hosts are directly reachable.',
    );
  }

  setGlobalDispatcher(agent);
}
