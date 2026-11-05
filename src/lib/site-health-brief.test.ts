import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reportIsStale, SITE_HEALTH_REPORT_PROMPT } from './site-health-brief.ts';

describe('Site Health Brief', () => {
  it('generate prompt is a normal operator query string', () => {
    assert.ok(SITE_HEALTH_REPORT_PROMPT.includes('firing'));
    assert.ok(SITE_HEALTH_REPORT_PROMPT.includes('詳細資料'));
    assert.ok(SITE_HEALTH_REPORT_PROMPT.includes('重點：'));
    assert.doesNotMatch(SITE_HEALTH_REPORT_PROMPT, /```rca/);
  });

  it('reportIsStale when metrics move after the Diagnosis Answer', () => {
    assert.equal(
      reportIsStale('2026-08-19T06:10:00.000Z', '2026-08-19T06:00:00.000Z'),
      true,
    );
    assert.equal(
      reportIsStale('2026-08-19T06:00:00.000Z', '2026-08-19T06:10:00.000Z'),
      false,
    );
  });
});
