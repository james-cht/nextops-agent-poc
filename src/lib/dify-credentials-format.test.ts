import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { maskSecret, toToolEndpointAdminPayload } from './dify-credentials-format.ts';

describe('maskSecret', () => {
  it('shows unset for blank', () => {
    assert.equal(maskSecret(''), '');
    assert.equal(maskSecret('   '), '');
  });

  it('keeps short prefix and last 4 for longer secrets', () => {
    assert.equal(maskSecret('app-58s0BAuzeCQCJwB3ZDa1AcYL'), 'app-••••AcYL');
  });

  it('fully masks very short secrets', () => {
    assert.equal(maskSecret('ab'), '••••');
  });
});

describe('toToolEndpointAdminPayload', () => {
  it('returns only masked Tool Endpoint Token fields', () => {
    const payload = toToolEndpointAdminPayload({
      toolToken: 'tok-12345678',
      source: 'override',
    });
    assert.deepEqual(Object.keys(payload).sort(), ['source', 'toolTokenMasked', 'toolTokenSet']);
    assert.equal(payload.toolTokenSet, true);
    assert.equal(payload.source, 'override');
    assert.equal(payload.toolTokenMasked, maskSecret('tok-12345678'));
  });

  it('marks an empty token as unset', () => {
    const payload = toToolEndpointAdminPayload({ toolToken: '', source: 'env' });
    assert.equal(payload.toolTokenSet, false);
    assert.equal(payload.toolTokenMasked, '');
  });
});
