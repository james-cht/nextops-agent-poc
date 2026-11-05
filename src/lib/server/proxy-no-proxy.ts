const LOOPBACK_NO_PROXY = ['localhost', '127.0.0.1', '::1'];

/** Compose / nerdctl sidecar names — never hairpin the corporate HTTP proxy. */
const IN_CLUSTER_NO_PROXY = [
  'langgraph-orchestrator',
  'nextops-orchestrator',
  'nextops',
  'mcp-adapter',
  'nextops-mcp',
];

export type ResolveNoProxyOptions = {
  /** When true, configured site upstream hostnames bypass the proxy (Direct Upstream Access). */
  bypassSiteHosts?: boolean;
  /** Extra absolute URLs whose hostnames should bypass the proxy (e.g. ES_BASE_URL). */
  extraUrls?: Array<string | undefined | null>;
};

function addUrlHost(hosts: Set<string>, endpoint: string): void {
  try {
    hosts.add(new URL(endpoint).hostname);
  } catch {
    // ignore malformed URLs
  }
}

/** Hosts that should not use the HTTP proxy when proxy mode is enabled. */
export function resolveNoProxy(
  siteConfigs: Record<string, { queryUrl: string; alertsUrl: string }>,
  options: ResolveNoProxyOptions = {},
): string {
  const bypassSiteHosts = options.bypassSiteHosts ?? true;
  const hosts = new Set([...LOOPBACK_NO_PROXY, ...IN_CLUSTER_NO_PROXY]);

  if (!bypassSiteHosts) {
    return [...hosts].join(',');
  }

  for (const config of Object.values(siteConfigs)) {
    for (const endpoint of [config.queryUrl, config.alertsUrl]) {
      addUrlHost(hosts, endpoint);
    }
  }

  for (const endpoint of options.extraUrls ?? []) {
    if (endpoint) addUrlHost(hosts, endpoint);
  }

  return [...hosts].join(',');
}
