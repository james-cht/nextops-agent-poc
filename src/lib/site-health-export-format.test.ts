import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatExportError, mapHttpStatusToExportCode } from './site-health-export-format';

describe('site-health-export-format', () => {
  it('maps common statuses', () => {
    assert.equal(mapHttpStatusToExportCode(404), 'NOT_FOUND');
    assert.equal(mapHttpStatusToExportCode(429), 'RATE_LIMITED');
  });

  it('builds export error objects', () => {
    assert.deepEqual(formatExportError(400, 'bad'), {
      error: 'bad',
      code: 'BAD_REQUEST',
    });
  });
});
