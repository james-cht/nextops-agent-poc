import type { OperatorRole } from './operator-role.ts';

export type ProjectRecord = {
  nameSpace: string;
  createdAt: string;
};

export type ProjectMembershipRecord = {
  nameSpace: string;
  username: string;
  addedAt: string;
};

export function canManageProjectMembership(role: OperatorRole | null | undefined): boolean {
  return role === 'platform_owner' || role === 'operator';
}

export function canAddAsProjectMember(
  account: { role: OperatorRole; disabled: boolean } | null | undefined,
): boolean {
  return account?.role === 'application_developer' && account.disabled === false;
}

export function projectsVisibleFor(opts: {
  role: OperatorRole;
  username: string;
  projects: ProjectRecord[];
  memberships: ProjectMembershipRecord[];
}): ProjectRecord[] {
  if (opts.role === 'application_developer') {
    const mine = new Set(
      opts.memberships.filter((m) => m.username === opts.username).map((m) => m.nameSpace),
    );
    return opts.projects.filter((p) => mine.has(p.nameSpace));
  }
  return [...opts.projects];
}
