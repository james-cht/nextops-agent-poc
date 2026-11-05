import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PIPELINE_TIMEOUT_SEC,
  DEFAULT_PIPELINE_WINDOW_HOURS,
  PIPELINE_TIMEOUT_SEC_OPTIONS,
  PIPELINE_WINDOW_HOURS_OPTIONS,
} from './pipeline-metrics-constants';

describe('pipeline metrics constants', () => {
  it('uses a default timeout that is one of the options', () => {
    expect(PIPELINE_TIMEOUT_SEC_OPTIONS).toContain(DEFAULT_PIPELINE_TIMEOUT_SEC);
  });

  it('uses a default window that is one of the options', () => {
    expect(PIPELINE_WINDOW_HOURS_OPTIONS).toContain(DEFAULT_PIPELINE_WINDOW_HOURS);
  });
});
