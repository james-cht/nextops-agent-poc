import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveClientIp } from './client-ip.ts';

describe('Client IP', () => {
  it('uses the TCP peer when no trusted proxy is configured', () => {
    assert.equal(
      resolveClientIp({
        peer: '192.0.2.15',
        forwardedFor: '8.8.8.8',
        trustedProxy: false,
      }),
      '192.0.2.15',
    );
  });

  it('uses the leftmost forwarded address only when a trusted proxy is configured', () => {
    assert.equal(
      resolveClientIp({
        peer: '192.0.2.4',
        forwardedFor: '203.0.113.4, 192.0.2.4',
        trustedProxy: true,
      }),
      '203.0.113.4',
    );
  });

  it('falls back to the peer when trusted proxy has no forwarded header', () => {
    assert.equal(
      resolveClientIp({
        peer: '192.0.2.4',
        forwardedFor: null,
        trustedProxy: true,
      }),
      '192.0.2.4',
    );
  });
});
