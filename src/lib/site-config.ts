import { env } from '$env/dynamic/private';
import defaultSiteConfigs from './site-config.json';
import { normalizeSiteConfigs, type RawSiteConfig } from './site-config-normalize';

export type DefaultLogMode = 'k8s' | 'non_k8s';

export interface SiteConfig {
  queryUrl: string;
  alertsUrl: string;
  clusterTag: string;
  /** Short code for ES log index routing (ADR-0013). Empty = log paths unavailable. */
  factoryCode: string;
  /** Smart Logging default K8s / non-K8s mode for this Site. */
  defaultLogMode: DefaultLogMode;
  /** POST = nginx subpath endpoint (queryUrl is the full path); GET = standard Prometheus /api/v1/query */
  queryMethod?: 'GET' | 'POST';
  /** Site catalog Robusta Coverage (deploy config, not a Runtime Setting). */
  robustaCoverage: boolean;
  /** Robusta Cluster Key used to filter Robusta Store rows. Empty = cannot list Investigations. */
  robustaClusterKey: string;
}

function loadSiteConfigs(): Record<string, SiteConfig> {
  if (env.NEXTOPS_SITES_CONFIG) {
    try {
      return normalizeSiteConfigs(
        JSON.parse(env.NEXTOPS_SITES_CONFIG) as Record<string, RawSiteConfig>,
      );
    } catch (e) {
      console.error('Failed to parse NEXTOPS_SITES_CONFIG environment variable:', e);
    }
  }
  return normalizeSiteConfigs(defaultSiteConfigs as Record<string, RawSiteConfig>);
}

export const SITE_CONFIGS = loadSiteConfigs();
