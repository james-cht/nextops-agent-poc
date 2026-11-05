import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashAdminPassword, verifyAdminPassword } from './admin-password.ts';

describe('admin password scrypt', () => {
  it('verifies a freshly hashed password', async () => {
    const stored = await hashAdminPassword('correct-horse');
    assert.equal(await verifyAdminPassword('correct-horse', stored), true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hashAdminPassword('correct-horse');
    assert.equal(await verifyAdminPassword('wrong', stored), false);
  });

  it('rejects malformed stored hash', async () => {
    assert.equal(await verifyAdminPassword('x', 'not-a-hash'), false);
  });
});
