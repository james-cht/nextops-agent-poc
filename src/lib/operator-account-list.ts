import type { OperatorRole } from './operator-role.ts';

export type OperatorAccountListRow = {
  username: string;
  email: string;
  displayName?: string | null;
  role: OperatorRole;
  disabled: boolean;
  secondFactorEnrolled: boolean;
  loginLocked: boolean;
};

export type OperatorAccountListFilters = {
  query?: string;
  roles?: OperatorRole[];
  disabled?: boolean | null;
  loginLocked?: boolean | null;
  pendingSecondFactor?: boolean | null;
};

export function filterOperatorAccounts<T extends OperatorAccountListRow>(
  accounts: T[],
  filters: OperatorAccountListFilters = {},
): T[] {
  const q = (filters.query ?? '').trim().toLowerCase();
  const roles = filters.roles ?? [];
  return accounts.filter((a) => {
    if (
      q &&
      !a.username.toLowerCase().includes(q) &&
      !a.email.toLowerCase().includes(q) &&
      !(a.displayName ?? '').toLowerCase().includes(q)
    ) {
      return false;
    }
    if (roles.length > 0 && !roles.includes(a.role)) return false;
    if (typeof filters.disabled === 'boolean' && a.disabled !== filters.disabled) return false;
    if (typeof filters.loginLocked === 'boolean' && a.loginLocked !== filters.loginLocked) {
      return false;
    }
    if (typeof filters.pendingSecondFactor === 'boolean') {
      const pending = !a.secondFactorEnrolled;
      if (pending !== filters.pendingSecondFactor) return false;
    }
    return true;
  });
}
