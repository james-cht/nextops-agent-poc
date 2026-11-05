import {
  DEFAULT_PIPELINE_TIMEOUT_SEC,
  DEFAULT_PIPELINE_WINDOW_HOURS,
  PIPELINE_EXCLUDED_BUILD_USERS,
  PIPELINE_WINDOW_HOURS_OPTIONS,
  type PipelineWindowHours,
} from '$lib/pipeline-metrics-constants';

export {
  PIPELINE_EXCLUDED_BUILD_USERS,
  PIPELINE_WINDOW_HOURS_OPTIONS,
  DEFAULT_PIPELINE_TIMEOUT_SEC,
  DEFAULT_PIPELINE_WINDOW_HOURS,
};
export type { PipelineWindowHours };

export interface PipelineQueryParams {
  thresholdSec: number;
  windowHours: PipelineWindowHours;
}

export function parsePipelineQueryParams(url: URL): PipelineQueryParams | { error: string } {
  const thresholdRaw = url.searchParams.get('thresholdSec');
  const windowRaw = url.searchParams.get('windowHours');

  const thresholdSec = thresholdRaw !== null ? parseInt(thresholdRaw, 10) : DEFAULT_PIPELINE_TIMEOUT_SEC;
  if (!Number.isFinite(thresholdSec) || thresholdSec <= 0) {
    return { error: 'thresholdSec must be a positive integer' };
  }

  const windowHours = windowRaw !== null ? parseInt(windowRaw, 10) : DEFAULT_PIPELINE_WINDOW_HOURS;
  if (!(PIPELINE_WINDOW_HOURS_OPTIONS as readonly number[]).includes(windowHours)) {
    return { error: 'windowHours must be 24, 48, or 168' };
  }

  return { thresholdSec, windowHours: windowHours as PipelineWindowHours };
}

/** Placeholders for `build_user NOT IN (?, …)` */
export function pipelineExcludedUserPlaceholders(): string {
  return PIPELINE_EXCLUDED_BUILD_USERS.map(() => '?').join(', ');
}
