import {
  DEFAULT_PIPELINE_TIMEOUT_SEC,
  DEFAULT_PIPELINE_WINDOW_HOURS,
  PIPELINE_TIMEOUT_SEC_CONFIG_KEY,
  PIPELINE_METRICS_WINDOW_HOURS_CONFIG_KEY,
  PIPELINE_TIMEOUT_SEC_OPTIONS,
  PIPELINE_WINDOW_HOURS_OPTIONS,
  type PipelineTimeoutSec,
  type PipelineWindowHours,
} from '$lib/pipeline-metrics-constants';

export {
  DEFAULT_PIPELINE_TIMEOUT_SEC,
  DEFAULT_PIPELINE_WINDOW_HOURS as DEFAULT_PIPELINE_METRICS_WINDOW_HOURS,
  PIPELINE_TIMEOUT_SEC_OPTIONS,
  PIPELINE_WINDOW_HOURS_OPTIONS as PIPELINE_METRICS_WINDOW_OPTIONS,
  PIPELINE_TIMEOUT_SEC_CONFIG_KEY,
  PIPELINE_METRICS_WINDOW_HOURS_CONFIG_KEY,
};
export type { PipelineTimeoutSec, PipelineWindowHours };

function readConfig(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem('nextops-config');
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return null;
  }
}

/** Read Pipeline Timeout Threshold from nextops-config (localStorage). */
export function getPipelineTimeoutSec(): PipelineTimeoutSec {
  const parsed = readConfig();
  const sec = parseInt(parsed?.[PIPELINE_TIMEOUT_SEC_CONFIG_KEY] ?? '', 10);
  if ((PIPELINE_TIMEOUT_SEC_OPTIONS as readonly number[]).includes(sec)) {
    return sec as PipelineTimeoutSec;
  }
  return DEFAULT_PIPELINE_TIMEOUT_SEC as PipelineTimeoutSec;
}

/** Read Pipeline Metrics Window from nextops-config (localStorage). */
export function getPipelineMetricsWindowHours(): PipelineWindowHours {
  const parsed = readConfig();
  const hours = parseInt(parsed?.[PIPELINE_METRICS_WINDOW_HOURS_CONFIG_KEY] ?? '', 10);
  if ((PIPELINE_WINDOW_HOURS_OPTIONS as readonly number[]).includes(hours)) {
    return hours as PipelineWindowHours;
  }
  return DEFAULT_PIPELINE_WINDOW_HOURS;
}

export function buildPipelineMetricsQueryString(): string {
  const params = new URLSearchParams();
  params.set('thresholdSec', String(getPipelineTimeoutSec()));
  params.set('windowHours', String(getPipelineMetricsWindowHours()));
  return params.toString();
}

/** Build href for Pipeline Timeout Drill-down (ADR-0006). */
export function buildPipelineTimeoutsHref(opts: {
  publicBasePath: string;
  appName?: string;
  windowHours?: PipelineWindowHours;
}): string {
  const params = new URLSearchParams();
  params.set('thresholdSec', String(getPipelineTimeoutSec()));
  params.set('windowHours', String(opts.windowHours ?? getPipelineMetricsWindowHours()));
  if (opts.appName) params.set('appName', opts.appName);
  const base = opts.publicBasePath.replace(/\/+$/, '');
  return `${base}/pipelines/timeouts?${params.toString()}`;
}
