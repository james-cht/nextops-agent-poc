import type { OperatorRole } from './operator-role.ts';

export type AccountAdminTab = 'accounts' | 'roles' | 'self';

export const ACCOUNT_ADMIN_TAB_LABELS: Record<AccountAdminTab, string> = {
  accounts: 'Accounts',
  roles: 'Roles',
  self: '自己的',
};

export const ACCOUNT_ADMIN_TAB_HREF: Record<AccountAdminTab, string> = {
  accounts: '/admin/account',
  roles: '/admin/account/roles',
  self: '/admin/account/me',
};

export function accountAdminTabs(role: OperatorRole): AccountAdminTab[] {
  if (role === 'platform_owner') return ['accounts', 'roles', 'self'];
  return ['roles', 'self'];
}

export function defaultAccountAdminTab(role: OperatorRole): AccountAdminTab {
  return role === 'platform_owner' ? 'accounts' : 'self';
}

export function defaultAccountAdminHref(role: OperatorRole): string {
  return ACCOUNT_ADMIN_TAB_HREF[defaultAccountAdminTab(role)];
}
