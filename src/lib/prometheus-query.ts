export type QueryMethod = 'GET' | 'POST';

/** NA/HTTPS Thanos queries through corporate proxy often exceed 5s. */
export const PROMETHEUS_FETCH_TIMEOUT_MS = 30_000;

export function formatPrometheusFetchError(
  error: unknown,
  url: string,
  method: string = 'GET',
  options?: { proxyEnabled?: boolean },
): string {
  const err = error instanceof Error ? error : new Error(String(error));
  const causeMsg = err.cause instanceof Error ? err.cause.message : '';
  const blob = `${err.message} ${causeMsg}`.toLowerCase();
  const isNaThanos = url.includes('unified-xops.corp.example.com') || url.includes('thanos-na');
  const isPrivateHttp = /^http:\/\/(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(url);
  const proxyEnabled = options?.proxyEnabled;

  let hint = '';
  if (blob.includes('503') || blob.includes('tunnel')) {
    hint = isNaThanos
      ? ' — corporate proxy rejected HTTPS CONNECT; FSJ/NA requires Akamai ZTNA or an internal metrics URL, not the HTTP proxy'
      : ' — corporate proxy rejected CONNECT tunnel to upstream; check PUBLIC_DEFAULT_PROXY_* and no_proxy';
  } else if (blob.includes('etimedout') || blob.includes('connect timeout')) {
    hint = isNaThanos
      ? ' — host unreachable (unified-xops.corp.example.com is behind Akamai ZTNA); connect ZTNA client or deploy where NA metrics are reachable'
      : isPrivateHttp
        ? proxyEnabled === false
          ? ' — internal Prometheus host unreachable from this NextOps instance; verify VPC/firewall routing (proxy is disabled)'
          : ' — internal Prometheus host unreachable from this NextOps instance; verify VPC/firewall routing and no_proxy when proxy is enabled'
        : ' — upstream connect timed out; verify network path from NextOps host to Prometheus';
  } else if (blob.includes('cancelled') || blob.includes('aborted due to timeout') || blob.includes('timeout')) {
    hint = isNaThanos
      ? ' — upstream timed out; NA Thanos is not reachable from this network segment (ZTNA or internal path required)'
      : isPrivateHttp
        ? proxyEnabled === false
          ? ` — internal Prometheus query timed out after ${PROMETHEUS_FETCH_TIMEOUT_MS}ms; verify routing/firewall and Prometheus load on this host (proxy is disabled)`
          : ' — internal Prometheus query timed out; verify 10.x/192.168.x routing, firewall, and no_proxy bypass when PUBLIC_DEFAULT_PROXY_ENABLED=true'
        : ' — upstream query timed out; verify Prometheus health and network latency from this host';
  }

  const cause = causeMsg ? ` (${causeMsg})` : '';
  return `${err.message}${cause}${hint} [${method} ${url}]`;
}

export function buildMetricsRequest(
  queryUrl: string,
  promql: string,
  queryMethod: QueryMethod = 'GET',
): { url: string; init: RequestInit } {
  const base = queryUrl.replace(/\/$/, '');

  if (queryMethod === 'POST') {
    return {
      url: `${base}/api/v1/query`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ query: promql }).toString(),
        signal: AbortSignal.timeout(PROMETHEUS_FETCH_TIMEOUT_MS),
      },
    };
  }

  return {
    url: `${base}/api/v1/query?${new URLSearchParams({ query: promql })}`,
    init: { signal: AbortSignal.timeout(PROMETHEUS_FETCH_TIMEOUT_MS) },
  };
}

/** One-shot probe used when metrics are empty — surfaces HTTP/TLS/proxy errors in diagnosis. */
export async function explainMetricsFetchFailure(
  queryUrl: string,
  promql: string,
  customFetch: typeof fetch = fetch,
  queryMethod: QueryMethod = 'GET',
  options?: { proxyEnabled?: boolean },
): Promise<string> {
  const { url, init } = buildMetricsRequest(queryUrl, promql, queryMethod);
  try {
    const res = await customFetch(url, init);
    if (!res.ok) {
      const snippet = await res.text().then((t) => t.slice(0, 200)).catch(() => '');
      return `HTTP ${res.status} ${res.statusText}${snippet ? `: ${snippet}` : ''}`;
    }
    const json = await res.json();
    if (!json.data?.result?.length) return 'Prometheus returned empty data.result';
    return 'Metrics fetch succeeded unexpectedly';
  } catch (e) {
    return formatPrometheusFetchError(e, url, init.method ?? 'GET', options);
  }
}
