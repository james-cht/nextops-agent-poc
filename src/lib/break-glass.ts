import type { OperatorRole } from './operator-role.ts';

export type BreakGlassRule = 'binding_gate' | 'previous_hop_green' | 'family_rewalk';

export type BreakGlassEntry = {
  nameSpace: string;
  appName: string;
  hop: string;
  reason: string;
  actor: string;
  rule: BreakGlassRule;
  at: string;
  becomesDefaultPath: false;
};

export function canInvokeBreakGlass(role: OperatorRole | null | undefined): boolean {
  return role === 'operator' || role === 'platform_owner';
}

export function recordBreakGlassSkip(opts: {
  nameSpace: string;
  appName: string;
  hop: string;
  reason: string;
  actor: string;
  rule: BreakGlassRule;
  at?: Date;
}): BreakGlassEntry {
  return {
    nameSpace: opts.nameSpace.trim().toLowerCase(),
    appName: opts.appName.trim().toLowerCase(),
    hop: opts.hop.trim().toLowerCase(),
    reason: opts.reason.trim(),
    actor: opts.actor.trim(),
    rule: opts.rule,
    at: (opts.at ?? new Date()).toISOString(),
    becomesDefaultPath: false,
  };
}
