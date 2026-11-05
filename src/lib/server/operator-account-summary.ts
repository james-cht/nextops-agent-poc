import type { LocalSettingsStore, OperatorRole } from './local-settings-store.ts';

export type OperatorAccountSummary = {
  username: string;
  email: string;
  displayName: string | null;
  role: OperatorRole;
  disabled: boolean;
  secondFactorEnrolled: boolean;
  lastSuccessfulLoginAt: string | null;
  sessionCount: number;
  loginLocked: boolean;
};

export function operatorAccountSummary(
  store: LocalSettingsStore,
  username: string,
  now?: Date,
): OperatorAccountSummary | null {
  const account = store.getOperatorAccount(username);
  if (!account) return null;
  return {
    username: account.username,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
    disabled: account.disabled,
    secondFactorEnrolled: account.secondFactorEnrolled,
    lastSuccessfulLoginAt: store.lastSuccessfulLoginAt(username, now),
    sessionCount: store.countSessions({ username, now }),
    loginLocked: store.isLoginLocked(username, now),
  };
}
