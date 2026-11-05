export type OperatorRole = 'platform_owner' | 'operator' | 'application_developer' | 'viewer';

/** Stable order for account forms and the Roles matrix. */
export const OPERATOR_ROLES: readonly OperatorRole[] = [
  'platform_owner',
  'operator',
  'application_developer',
  'viewer',
] as const;

export function isOperatorRole(value: string): value is OperatorRole {
  return (OPERATOR_ROLES as readonly string[]).includes(value);
}

export function operatorRoleLabel(role: OperatorRole): string {
  if (role === 'platform_owner') return 'Platform Owner';
  if (role === 'operator') return 'Operator';
  if (role === 'application_developer') return 'Application Developer';
  return 'Viewer';
}

/** Hover / title text: account first, then Operator Role. */
export function operatorAccountTooltip(username: string, role: OperatorRole): string {
  return `${username} · ${operatorRoleLabel(role)}`;
}

/** Platform Owner only — Diagnosis Trace registry (ADR-0024). */
export function canViewDiagnosisTraces(role: OperatorRole | null | undefined): boolean {
  return role === 'platform_owner';
}

/** Viewer and Application Developer must not start an Orchestrator Chat Contract turn (ADR-0025 / Operator Role). */
export function canStartDiagnosisTurn(role: OperatorRole | null | undefined): boolean {
  return role === 'platform_owner' || role === 'operator';
}
