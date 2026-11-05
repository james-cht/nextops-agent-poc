import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canAddAsProjectMember,
  canManageProjectMembership,
  projectsVisibleFor,
  type ProjectRecord,
  type ProjectMembershipRecord,
} from './application-online-membership.ts';

const projects: ProjectRecord[] = [
  { nameSpace: 'efactory', createdAt: '2026-01-01T00:00:00.000Z' },
  { nameSpace: 'control-tower', createdAt: '2026-01-02T00:00:00.000Z' },
];

const memberships: ProjectMembershipRecord[] = [
  { nameSpace: 'efactory', username: 'lin.dev', addedAt: '2026-01-03T00:00:00.000Z' },
];

describe('Project Membership rules', () => {
  it('lets only Operator and Platform Owner change membership', () => {
    assert.equal(canManageProjectMembership('platform_owner'), true);
    assert.equal(canManageProjectMembership('operator'), true);
    assert.equal(canManageProjectMembership('application_developer'), false);
    assert.equal(canManageProjectMembership('viewer'), false);
    assert.equal(canManageProjectMembership(null), false);
  });

  it('adds only an existing enabled Application Developer as a Project Member', () => {
    assert.equal(canAddAsProjectMember({ role: 'application_developer', disabled: false }), true);
    assert.equal(canAddAsProjectMember({ role: 'application_developer', disabled: true }), false);
    assert.equal(canAddAsProjectMember({ role: 'operator', disabled: false }), false);
    assert.equal(canAddAsProjectMember({ role: 'viewer', disabled: false }), false);
    assert.equal(canAddAsProjectMember(null), false);
  });

  it('lists every Project for Operator, Owner, and Viewer; only memberships for Developer', () => {
    assert.deepEqual(
      projectsVisibleFor({
        role: 'operator',
        username: 'ops',
        projects,
        memberships,
      }).map((p) => p.nameSpace),
      ['efactory', 'control-tower'],
    );
    assert.deepEqual(
      projectsVisibleFor({
        role: 'application_developer',
        username: 'lin.dev',
        projects,
        memberships,
      }).map((p) => p.nameSpace),
      ['efactory'],
    );
    assert.deepEqual(
      projectsVisibleFor({
        role: 'application_developer',
        username: 'other.dev',
        projects,
        memberships,
      }),
      [],
    );
    assert.deepEqual(
      projectsVisibleFor({
        role: 'viewer',
        username: 'watch',
        projects,
        memberships,
      }).map((p) => p.nameSpace),
      ['efactory', 'control-tower'],
    );
  });
});
