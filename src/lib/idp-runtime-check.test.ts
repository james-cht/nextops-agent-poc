import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  authorizeIdpCallbackToken,
  parseRuntimeCheckPayload,
} from './idp-runtime-check.ts';

describe('IDP Runtime Check callback', () => {
  it('rejects missing or wrong IDP Callback Token', () => {
    assert.equal(authorizeIdpCallbackToken({ provided: null, expected: 'secret' }).ok, false);
    assert.equal(authorizeIdpCallbackToken({ provided: 'nope', expected: 'secret' }).ok, false);
    assert.equal(authorizeIdpCallbackToken({ provided: 'secret', expected: 'secret' }).ok, true);
  });

  it('parses structured Runtime Check without allowing pin or membership mutations', () => {
    const parsed = parseRuntimeCheckPayload({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      runId: 'run-1',
      ready: false,
      probe: 'http_get:/healthz failed',
      publishedPinSha: 'evil',
      membershipUsername: 'attacker',
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.check.ready, false);
      assert.equal(parsed.check.runId, 'run-1');
      assert.match(parsed.check.probe, /healthz/);
      assert.equal(Object.hasOwn(parsed.check, 'publishedPinSha'), false);
      assert.equal(Object.hasOwn(parsed.check, 'membershipUsername'), false);
    }
  });
});
