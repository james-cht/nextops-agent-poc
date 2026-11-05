import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chatCanReadRoom,
  chatShouldInvokeOpsgpt,
  chatWriteBlock,
  buildChatRoster,
} from './operator-chat-access.ts';
import { OPSGPT_PARTICIPANT_ID } from './operator-chat-types.ts';

describe('chatCanReadRoom', () => {
  it('lets every Operator Account read the Public Room and only members read a DM', () => {
    assert.equal(chatCanReadRoom({ kind: 'public', username: 'carol', memberIds: [] }), true);
    assert.equal(
      chatCanReadRoom({ kind: 'operator_dm', username: 'alice', memberIds: ['alice', 'bob'] }),
      true,
    );
    assert.equal(
      chatCanReadRoom({ kind: 'operator_dm', username: 'owner', memberIds: ['alice', 'bob'] }),
      false,
    );
  });
});

describe('chatWriteBlock', () => {
  it('rejects a third account, a disabled counterpart, and Viewer sends in an OPSGPT DM', () => {
    assert.equal(
      chatWriteBlock({
        kind: 'operator_dm',
        username: 'owner',
        memberIds: ['alice', 'bob'],
        role: 'platform_owner',
        counterpartDisabled: false,
      }),
      'FORBIDDEN',
    );
    assert.equal(
      chatWriteBlock({
        kind: 'operator_dm',
        username: 'alice',
        memberIds: ['alice', 'bob'],
        role: 'operator',
        counterpartDisabled: true,
      }),
      'DISABLED',
    );
    assert.equal(
      chatWriteBlock({
        kind: 'opsgpt_dm',
        username: 'viewer1',
        memberIds: ['viewer1', 'participant:opsgpt'],
        role: 'viewer',
        counterpartDisabled: false,
      }),
      'VIEWER',
    );
  });
});

describe('chatShouldInvokeOpsgpt', () => {
  it('invokes from Public Room prefix or OPSGPT DM, never from an Operator DM', () => {
    assert.equal(
      chatShouldInvokeOpsgpt({ kind: 'public', role: 'operator', body: '@OPSGPT ping' }),
      true,
    );
    assert.equal(
      chatShouldInvokeOpsgpt({ kind: 'opsgpt_dm', role: 'platform_owner', body: 'ping' }),
      true,
    );
    assert.equal(
      chatShouldInvokeOpsgpt({ kind: 'operator_dm', role: 'operator', body: '@OPSGPT ping' }),
      false,
    );
    assert.equal(
      chatShouldInvokeOpsgpt({ kind: 'public', role: 'viewer', body: '@OPSGPT ping' }),
      false,
    );
  });
});

describe('buildChatRoster', () => {
  it('pins OPSGPT and lists enabled Operator Display Name when set', () => {
    const roster = buildChatRoster({
      viewerUsername: 'alice',
      accounts: [
        { username: 'alice', role: 'operator', disabled: false },
        { username: 'bob', displayName: '鮑伯', role: 'viewer', disabled: false },
        { username: 'old', role: 'operator', disabled: true },
      ],
    });
    assert.deepEqual(
      roster.map((e) => e.id),
      [OPSGPT_PARTICIPANT_ID, 'bob'],
    );
    assert.equal(roster[0]?.kind, 'opsgpt');
    assert.equal(roster[1]?.displayName, '鮑伯');
    assert.equal(roster[1]?.role, 'viewer');
    assert.equal(JSON.stringify(roster).includes('@'), false);
  });
});
