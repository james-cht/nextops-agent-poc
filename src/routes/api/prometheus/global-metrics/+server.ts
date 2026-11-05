import { json } from '@sveltejs/kit';
import { PUBLIC_DEFAULT_PROMETHEUS_URL } from '$env/static/public';
import { clearError } from '$lib/server/diagnosis';
import { recordUpstreamDiagnostic } from '$lib/server/upstream-diagnostic';
import { buildMetricsRequest, formatPrometheusFetchError } from '$lib/prometheus-query';
import { isProxyEnabled } from '$lib/server/proxy';
import {
  GLOBAL_HEALTH_PROMQL,
  GLOBAL_LATENCY_PROMQL,
  mapGlobalMetrics,
  type MetricQuerySide,
  type PrometheusInstantResponse,
} from '$lib/global-metrics';

async function queryInstant(
  customFetch: typeof fetch,
  promBase: string,
  promql: string,
  proxyEnabled: boolean,
): Promise<MetricQuerySide> {
  const { url, init } = buildMetricsRequest(promBase, promql);
  try {
    const res = await customFetch(url, init);
    if (!res.ok) {
      return { fetchError: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as PrometheusInstantResponse;
    return { data };
  } catch (error: unknown) {
    return {
      fetchError: formatPrometheusFetchError(error, url, init.method ?? 'GET', { proxyEnabled }),
    };
  }
}

export async function GET({ url, fetch, locals }) {
  const promBase = url.searchParams.get('prometheusUrl') || PUBLIC_DEFAULT_PROMETHEUS_URL || 'http://192.0.2.5:20902';
  const cleanPromBase = promBase.replace(/\/$/, '');
  const proxyEnabled = isProxyEnabled();
  const kpiParam = url.searchParams.get('kpi');
  const includeHealth = kpiParam !== 'latency';
  const includeLatency = kpiParam !== 'health';

  try {
    const [healthSide, latencySide] = await Promise.all([
      includeHealth ? queryInstant(fetch, cleanPromBase, GLOBAL_HEALTH_PROMQL, proxyEnabled) : Promise.resolve(undefined),
      includeLatency ? queryInstant(fetch, cleanPromBase, GLOBAL_LATENCY_PROMQL, proxyEnabled) : Promise.resolve(undefined),
    ]);

    const mapped = mapGlobalMetrics({
      health: healthSide,
      latency: latencySide,
    });

    const requestedSides = [healthSide, latencySide].filter(
      (side): side is MetricQuerySide => side !== undefined,
    );
    const fetchFailures = requestedSides.filter((side) => side.fetchError);

    if (fetchFailures.length > 0) {
      const detail = [
        healthSide?.fetchError ? `Health: ${healthSide.fetchError}` : null,
        latencySide?.fetchError ? `Latency: ${latencySide.fetchError}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      recordUpstreamDiagnostic({
        service: 'Prometheus (Global)',
        message: 'Failed to fetch global metrics from Prometheus',
        detail,
        requestId: locals.requestId,
        upstreamUrl: cleanPromBase,
        dependency: 'Prometheus',
        proxyEnabled,
      });
    }

    const allRequestedFailed = requestedSides.length > 0 && fetchFailures.length === requestedSides.length;
    if (allRequestedFailed) {
      return json(
        { error: 'Failed to fetch metrics from Prometheus', ...mapped },
        { status: 502 },
      );
    }

    if (fetchFailures.length === 0) {
      clearError('Prometheus (Global)');
    }

    return json(mapped);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const detail = formatPrometheusFetchError(error, `${cleanPromBase}/api/v1/query`, 'GET', { proxyEnabled });
    recordUpstreamDiagnostic({
      service: 'Prometheus (Global)',
      message: `Prometheus unreachable: ${msg}`,
      detail,
      requestId: locals.requestId,
      upstreamUrl: cleanPromBase,
      dependency: 'Prometheus',
      proxyEnabled,
    });
    return json({ error: detail }, { status: 502 });
  }
}
