import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  accountAdminTabs,
  defaultAccountAdminHref,
  defaultAccountAdminTab,
} from './account-admin-nav.ts';

describe('account admin navigation', () => {
  it('gives Platform Owner Accounts, Roles, and 自己的; others omit Accounts', () => {
    assert.deepEqual(accountAdminTabs('platform_owner'), ['accounts', 'roles', 'self']);
    assert.deepEqual(accountAdminTabs('operator'), ['roles', 'self']);
    assert.deepEqual(accountAdminTabs('application_developer'), ['roles', 'self']);
    assert.deepEqual(accountAdminTabs('viewer'), ['roles', 'self']);
  });

  it('sends Header Username to Accounts for Owner and 自己的 for everyone else', () => {
    assert.equal(defaultAccountAdminTab('platform_owner'), 'accounts');
    assert.equal(defaultAccountAdminHref('platform_owner'), '/admin/account');
    assert.equal(defaultAccountAdminTab('operator'), 'self');
    assert.equal(defaultAccountAdminHref('application_developer'), '/admin/account/me');
    assert.equal(defaultAccountAdminHref('viewer'), '/admin/account/me');
  });
});
