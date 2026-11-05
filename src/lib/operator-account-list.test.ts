import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterOperatorAccounts, type OperatorAccountListRow } from './operator-account-list.ts';

const rows: OperatorAccountListRow[] = [
  {
    username: 'mc00146',
    email: 'owner@corp.example',
    role: 'platform_owner',
    disabled: false,
    secondFactorEnrolled: true,
    loginLocked: false,
  },
  {
    username: 'intern',
    email: 'intern@corp.example',
    role: 'viewer',
    disabled: true,
    secondFactorEnrolled: false,
    loginLocked: true,
  },
];

describe('filterOperatorAccounts', () => {
  it('searches Username, Operator Email, and Operator Display Name', () => {
    assert.equal(filterOperatorAccounts(rows, { query: 'MC00' }).length, 1);
    assert.equal(filterOperatorAccounts(rows, { query: 'intern@' })[0]?.username, 'intern');
    assert.equal(filterOperatorAccounts(rows, { query: 'Platform' }).length, 0);
    const withNames = rows.map((r) =>
      r.username === 'intern' ? { ...r, displayName: '王小明' } : { ...r, displayName: null },
    );
    assert.equal(filterOperatorAccounts(withNames, { query: '王小' })[0]?.username, 'intern');
  });

  it('filters by Operator Role, disabled, Login Lockout, and pending Second Factor', () => {
    assert.equal(filterOperatorAccounts(rows, { roles: ['viewer'] })[0]?.username, 'intern');
    assert.equal(filterOperatorAccounts(rows, { disabled: true })[0]?.username, 'intern');
    assert.equal(filterOperatorAccounts(rows, { loginLocked: true })[0]?.username, 'intern');
    assert.equal(filterOperatorAccounts(rows, { pendingSecondFactor: true })[0]?.username, 'intern');
    assert.equal(filterOperatorAccounts(rows, { disabled: false, roles: ['viewer'] }).length, 0);
  });

  it('keeps extra Accounts columns on the filtered rows', () => {
    const withCols = rows.map((r) => ({
      ...r,
      lastSuccessfulLoginAt: '2026-01-01T00:00:00.000Z',
      sessionCount: 2,
    }));
    const out = filterOperatorAccounts(withCols, { query: 'intern' });
    assert.equal(out[0]?.sessionCount, 2);
    assert.equal(out[0]?.lastSuccessfulLoginAt, '2026-01-01T00:00:00.000Z');
  });
});
