/** PromQL for Global Matrix Dashboard service-response KPIs. */
export const GLOBAL_HEALTH_PROMQL =
  'es_traffic_error_count/es_traffic_total_count{region="total"}';
export const GLOBAL_LATENCY_PROMQL = 'es_traffic_avg_response_time{region="total"}';

export const EMPTY_PROM_RESULT_MESSAGE = 'Prometheus returned empty data.result';

export type PrometheusInstantResponse = {
  status?: string;
  error?: string;
  data?: { result?: Array<{ value?: [number | string, string] }> };
};

export type GlobalMetrics = {
  healthScore: number | null;
  avgLatency: number | null;
  healthScoreError?: string;
  avgLatencyError?: string;
};

export type MetricQuerySide = {
  data?: PrometheusInstantResponse;
  fetchError?: string;
};

export type KpiPresentation = {
  value: string | number;
  error?: string;
  loading: boolean;
};

export function parseInstantSample(data: PrometheusInstantResponse | undefined): number | null {
  if (!data || data.status === 'error') return null;
  const result = data.data?.result ?? [];
  if (result.length === 0) return null;
  const raw = parseFloat(String(result[0]?.value?.[1] ?? ''));
  return Number.isFinite(raw) ? raw : null;
}

export function mapHealthScore(errorRate: number | null): number | null {
  if (errorRate === null) return null;
  return Math.round((1 - errorRate) * 100 * 10) / 10;
}

export function mapAvgLatencyMs(seconds: number | null): number | null {
  if (seconds === null) return null;
  return Math.round(seconds * 1000);
}

/** Map Prometheus instant-query payloads onto Global Matrix KPI fields. */
export function mapGlobalMetrics(input: {
  health?: MetricQuerySide;
  latency?: MetricQuerySide;
}): GlobalMetrics {
  const out: GlobalMetrics = { healthScore: null, avgLatency: null };

  if (input.health) {
    const { data, fetchError } = input.health;
    if (fetchError) {
      out.healthScoreError = fetchError;
    } else if (data?.status === 'error') {
      out.healthScoreError = data.error || 'Prometheus query failed';
    } else {
      const sample = parseInstantSample(data);
      out.healthScore = sample === null ? 100 : mapHealthScore(sample);
    }
  }

  if (input.latency) {
    const { data, fetchError } = input.latency;
    if (fetchError) {
      out.avgLatencyError = fetchError;
    } else if (data?.status === 'error') {
      out.avgLatencyError = data.error || 'Prometheus query failed';
    } else {
      const sample = parseInstantSample(data);
      out.avgLatency = mapAvgLatencyMs(sample);
      if (out.avgLatency === null) {
        out.avgLatencyError = EMPTY_PROM_RESULT_MESSAGE;
      }
    }
  }

  return out;
}

/** How a Global Matrix KPI card should look after (or during) a fetch. */
export function presentKpi(
  value: number | null,
  error: string | null | undefined,
  settled: boolean,
): KpiPresentation {
  if (error) return { value: '---', error, loading: false };
  if (!settled) return { value: '---', loading: true };
  if (value === null) {
    return { value: '---', error: EMPTY_PROM_RESULT_MESSAGE, loading: false };
  }
  return { value, loading: false };
}
