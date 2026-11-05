import { env as privateEnv } from '$env/dynamic/private';
import {
  normalizeLogIndexPrefix,
  resolveLogIndex,
  type LogMode,
  type ResolveLogIndexResult,
} from '$lib/log-index';
import { SITE_CONFIGS } from '$lib/site-config';

export function getLogIndexPrefix(): string {
  return normalizeLogIndexPrefix(privateEnv.LOG_INDEX_PREFIX);
}

export function listSitesMissingFactoryCode(): string[] {
  return Object.entries(SITE_CONFIGS)
    .filter(([, cfg]) => !cfg.factoryCode?.trim())
    .map(([siteId]) => siteId)
    .sort((a, b) => a.localeCompare(b));
}

export function resolveLogIndexForSite(opts: {
  siteId: string;
  mode?: string | null;
  index?: string | null;
  timeFrom?: string | null;
  timeTo?: string | null;
  expandWeeks?: boolean;
}): ResolveLogIndexResult & { factoryCode?: string; defaultLogMode?: LogMode } {
  const config = SITE_CONFIGS[opts.siteId];
  if (!config) {
    return { ok: false, code: 'FACTORY_CODE_MISSING', message: `Unknown site: ${opts.siteId}` };
  }
  if (!config.factoryCode?.trim()) {
    return {
      ok: false,
      code: 'FACTORY_CODE_MISSING',
      message: `Site "${opts.siteId}" has no Factory Code; log queries are unavailable`,
    };
  }

  const mode = (opts.mode as LogMode | undefined) || config.defaultLogMode || 'k8s';
  const result = resolveLogIndex({
    prefix: getLogIndexPrefix(),
    factoryCode: config.factoryCode,
    mode,
    index: opts.index,
    timeFrom: opts.timeFrom,
    timeTo: opts.timeTo,
    expandWeeks: opts.expandWeeks,
  });

  if (!result.ok) return result;
  return {
    ...result,
    factoryCode: config.factoryCode,
    defaultLogMode: config.defaultLogMode,
  };
}
