import type { DefaultLogMode, SiteConfig } from './site-config';

export type RawSiteConfig = Partial<SiteConfig> & {
  query_url?: string;
  alerts_url?: string;
  cluster_tag?: string;
  query_method?: string;
  factory_code?: string;
  default_log_mode?: string;
  robusta_coverage?: boolean;
  robusta_cluster_key?: string;
};

function normalizeQueryMethod(method: unknown): 'GET' | 'POST' {
  const normalized = typeof method === 'string' ? method.toUpperCase() : '';
  if (normalized === 'GET' || normalized === 'POST') return normalized;

  // Default to standard Prometheus GET /api/v1/query. Thanos nginx subpaths
  // (e.g. NA's /thanos-na/query-api) still serve the API at /api/v1/query.
  return 'GET';
}

function normalizeDefaultLogMode(raw: unknown): DefaultLogMode {
  return raw === 'non_k8s' ? 'non_k8s' : 'k8s';
}

export function normalizeSiteConfig(raw: RawSiteConfig): SiteConfig {
  const queryUrl = raw.queryUrl ?? raw.query_url ?? '';
  const alertsUrl = raw.alertsUrl ?? raw.alerts_url ?? '';
  const clusterTag = raw.clusterTag ?? raw.cluster_tag ?? '';
  const factoryCode = (raw.factoryCode ?? raw.factory_code ?? '').trim();
  const defaultLogMode = normalizeDefaultLogMode(
    raw.defaultLogMode ?? raw.default_log_mode,
  );
  const robustaClusterKey = String(raw.robustaClusterKey ?? raw.robusta_cluster_key ?? '').trim();
  const robustaCoverage = raw.robustaCoverage === true || raw.robusta_coverage === true;

  return {
    queryUrl,
    alertsUrl,
    clusterTag,
    factoryCode,
    defaultLogMode,
    queryMethod: normalizeQueryMethod(raw.queryMethod ?? raw.query_method),
    robustaCoverage,
    robustaClusterKey,
  };
}

export function normalizeSiteConfigs(
  configs: Record<string, RawSiteConfig>,
): Record<string, SiteConfig> {
  return Object.fromEntries(
    Object.entries(configs).map(([siteId, config]) => [siteId, normalizeSiteConfig(config)]),
  );
}
