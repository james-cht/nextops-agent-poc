/** Cluster Operator Build accounts excluded from operator-facing pipeline metrics. */
export const PIPELINE_EXCLUDED_BUILD_USERS = ['mc00146', 'mc00255', 'admin', 'null'] as const;

export const PIPELINE_WINDOW_HOURS_OPTIONS = [24, 48, 168] as const;
export type PipelineWindowHours = (typeof PIPELINE_WINDOW_HOURS_OPTIONS)[number];

export const PIPELINE_TIMEOUT_SEC_OPTIONS = [180, 300, 600, 900] as const;
export type PipelineTimeoutSec = (typeof PIPELINE_TIMEOUT_SEC_OPTIONS)[number];

export const DEFAULT_PIPELINE_TIMEOUT_SEC = 300;
export const DEFAULT_PIPELINE_WINDOW_HOURS: PipelineWindowHours = 24;

export const PIPELINE_TIMEOUT_SEC_CONFIG_KEY = 'pipeline_timeout_sec';
export const PIPELINE_METRICS_WINDOW_HOURS_CONFIG_KEY = 'pipeline_metrics_window_hours';
