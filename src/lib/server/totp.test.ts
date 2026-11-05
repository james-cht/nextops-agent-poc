import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateTotpSecret, totpCodeAt, verifyTotp } from './totp.ts';

describe('TOTP Second Factor', () => {
  it('verifies a code generated for the same timestep', () => {
    const secret = generateTotpSecret();
    const now = Date.parse('2026-08-01T00:00:00.000Z');
    const code = totpCodeAt(secret, now);
    assert.match(code, /^\d{6}$/);
    assert.equal(verifyTotp(secret, code, now), true);
    assert.equal(verifyTotp(secret, '000000', now), false);
  });

  it('accepts an adjacent timestep (clock skew)', () => {
    const secret = generateTotpSecret();
    const now = Date.parse('2026-08-01T00:00:00.000Z');
    const code = totpCodeAt(secret, now);
    assert.equal(verifyTotp(secret, code, now + 30_000), true);
    assert.equal(verifyTotp(secret, code, now - 30_000), true);
  });
});
