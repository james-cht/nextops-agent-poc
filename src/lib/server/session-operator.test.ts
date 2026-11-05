import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decodeOperatorSession,
  encodeOperatorSession,
  LEGACY_SESSION_VALUE,
} from './session-operator.ts';

describe('session-operator', () => {
  it('encodes and decodes operator username', () => {
    assert.equal(encodeOperatorSession('ops'), 'op:ops');
    assert.equal(decodeOperatorSession('op:ops', null), 'ops');
  });

  it('falls back for legacy authenticated cookie', () => {
    assert.equal(decodeOperatorSession(LEGACY_SESSION_VALUE, 'admin'), 'admin');
    assert.equal(decodeOperatorSession(LEGACY_SESSION_VALUE, null), null);
  });
});
