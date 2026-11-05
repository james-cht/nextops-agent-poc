import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  MESSAGE_BODY_MAX,
  MESSAGE_RETENTION_MS,
  OPSGPT_PARTICIPANT_ID,
  PUBLIC_ROOM_ID,
  openOperatorChatStore,
  type OperatorChatStore,
} from './operator-chat-store.ts';

const dirs: string[] = [];
const stores: OperatorChatStore[] = [];

afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmpDb(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-chat-'));
  dirs.push(d);
  return path.join(d, 'operator-chat.sqlite');
}

function open(): OperatorChatStore {
  const store = openOperatorChatStore(tmpDb());
  stores.push(store);
  return store;
}

describe('Operator Chat Store — Public Room', () => {
  it('bootstraps the Public Room and persists a human message across reopen', () => {
    const dbPath = tmpDb();
    const store = openOperatorChatStore(dbPath);
    stores.push(store);
    const posted = store.postHumanMessage({
      roomId: PUBLIC_ROOM_ID,
      authorId: 'mc00146',
      body: '龍華 CPU 先看一下',
    });
    assert.equal(posted.ok, true);
    if (!posted.ok) return;
    assert.equal(posted.message.roomId, PUBLIC_ROOM_ID);
    assert.equal(posted.message.authorId, 'mc00146');
    assert.equal(posted.message.body, '龍華 CPU 先看一下');
    assert.equal(posted.message.status, 'complete');
    store.close();
    stores.pop();

    const again = openOperatorChatStore(dbPath);
    stores.push(again);
    const page = again.listMessages({ roomId: PUBLIC_ROOM_ID });
    assert.equal(page.messages.length, 1);
    assert.equal(page.messages[0]?.body, '龍華 CPU 先看一下');
    assert.equal(page.cursor, null);
  });

  it('rejects empty and oversize bodies without writing', () => {
    const store = open();
    assert.equal(store.postHumanMessage({ roomId: PUBLIC_ROOM_ID, authorId: 'a', body: '   ' }).ok, false);
    assert.equal(
      store.postHumanMessage({
        roomId: PUBLIC_ROOM_ID,
        authorId: 'a',
        body: 'x'.repeat(MESSAGE_BODY_MAX + 1),
      }).ok,
      false,
    );
    assert.equal(store.listMessages({ roomId: PUBLIC_ROOM_ID }).messages.length, 0);
  });

  it('keeps newlines and lists newest page oldest-first with a cursor for older rows', () => {
    const store = open();
    const t0 = new Date('2026-09-03T00:00:00.000Z');
    for (let i = 0; i < 3; i++) {
      const posted = store.postHumanMessage({
        roomId: PUBLIC_ROOM_ID,
        authorId: 'ops',
        body: `line ${i}\nnext`,
        now: new Date(t0.getTime() + i * 1000),
      });
      assert.equal(posted.ok, true);
    }
    const listedAt = new Date(t0.getTime() + 2 * 1000);
    const page = store.listMessages({ roomId: PUBLIC_ROOM_ID, limit: 2, now: listedAt });
    assert.deepEqual(page.messages.map((m) => m.body), ['line 1\nnext', 'line 2\nnext']);
    assert.ok(page.cursor);
    const older = store.listMessages({
      roomId: PUBLIC_ROOM_ID,
      limit: 2,
      cursor: page.cursor ?? undefined,
      now: listedAt,
    });
    assert.deepEqual(older.messages.map((m) => m.body), ['line 0\nnext']);
    assert.equal(older.cursor, null);
  });

  it('prunes messages older than 30 days so they are not listed', () => {
    const store = open();
    const now = new Date('2026-09-03T12:00:00.000Z');
    const stale = store.postHumanMessage({
      roomId: PUBLIC_ROOM_ID,
      authorId: 'ops',
      body: 'old',
      now: new Date(now.getTime() - MESSAGE_RETENTION_MS - 1000),
    });
    const fresh = store.postHumanMessage({
      roomId: PUBLIC_ROOM_ID,
      authorId: 'ops',
      body: 'new',
      now,
    });
    assert.equal(stale.ok, true);
    assert.equal(fresh.ok, true);
    store.pruneExpired(now);
    const page = store.listMessages({ roomId: PUBLIC_ROOM_ID, now });
    assert.deepEqual(page.messages.map((m) => m.body), ['new']);
  });

  it('does not write Operator DM or OPSGPT DM in this store path until those rooms exist', () => {
    const store = open();
    const posted = store.postHumanMessage({
      roomId: 'dm:alice:bob',
      authorId: 'alice',
      body: 'hi',
    });
    assert.equal(posted.ok, false);
    if (posted.ok) return;
    assert.equal(posted.code, 'NOT_FOUND');
  });
});

describe('Operator Chat Store — last-read', () => {
  it('does not unread the author after they post; the other Operator Account sees one unread room', () => {
    const store = open();
    const posted = store.postHumanMessage({
      roomId: PUBLIC_ROOM_ID,
      authorId: 'alice',
      body: 'handoff',
    });
    assert.equal(posted.ok, true);
    const alice = store.unreadSummary('alice');
    const bob = store.unreadSummary('bob');
    assert.equal(alice.unreadRoomCount, 0);
    assert.equal(alice.rooms.find((r) => r.roomId === PUBLIC_ROOM_ID)?.unread, false);
    assert.equal(bob.unreadRoomCount, 1);
    assert.equal(bob.rooms.find((r) => r.roomId === PUBLIC_ROOM_ID)?.unread, true);
  });

  it('clears Public Room unread after last-read advances to the latest message', () => {
    const store = open();
    const posted = store.postHumanMessage({
      roomId: PUBLIC_ROOM_ID,
      authorId: 'alice',
      body: 'ping',
    });
    assert.equal(posted.ok, true);
    if (!posted.ok) return;
    store.markRead({
      roomId: PUBLIC_ROOM_ID,
      username: 'bob',
      messageId: posted.message.id,
      createdAt: posted.message.createdAt,
    });
    assert.equal(store.unreadSummary('bob').unreadRoomCount, 0);
  });

  it('keeps last-read across reopen and refuses to move it backward', () => {
    const dbPath = tmpDb();
    const store = openOperatorChatStore(dbPath);
    stores.push(store);
    const first = store.postHumanMessage({
      roomId: PUBLIC_ROOM_ID,
      authorId: 'alice',
      body: 'one',
      now: new Date('2026-09-03T10:00:00.000Z'),
    });
    const second = store.postHumanMessage({
      roomId: PUBLIC_ROOM_ID,
      authorId: 'alice',
      body: 'two',
      now: new Date('2026-09-03T10:00:01.000Z'),
    });
    assert.equal(first.ok && second.ok, true);
    if (!first.ok || !second.ok) return;
    store.markRead({
      roomId: PUBLIC_ROOM_ID,
      username: 'bob',
      messageId: second.message.id,
      createdAt: second.message.createdAt,
    });
    store.markRead({
      roomId: PUBLIC_ROOM_ID,
      username: 'bob',
      messageId: first.message.id,
      createdAt: first.message.createdAt,
    });
    store.close();
    stores.pop();
    const again = openOperatorChatStore(dbPath);
    stores.push(again);
    assert.equal(again.unreadSummary('bob').unreadRoomCount, 0);
  });
});

describe('Operator Chat Store — Operator DM', () => {
  it('reuses one Operator DM and hides it from a third account including unread', () => {
    const store = open();
    const first = store.getOrCreateOperatorDm('alice', 'bob');
    const again = store.getOrCreateOperatorDm('bob', 'alice');
    assert.equal(first.ok && again.ok, true);
    if (!first.ok || !again.ok) return;
    assert.equal(first.roomId, again.roomId);
    const self = store.getOrCreateOperatorDm('alice', 'alice');
    assert.equal(self.ok, false);

    const posted = store.postHumanMessage({
      roomId: first.roomId,
      authorId: 'alice',
      body: 'handoff',
    });
    assert.equal(posted.ok, true);

    const aliceRooms = store.listRoomsFor('alice').map((r) => r.id);
    const carolUnread = store.unreadSummary('carol');
    assert.equal(aliceRooms.includes(first.roomId), true);
    assert.equal(store.listRoomsFor('carol').some((r) => r.id === first.roomId), false);
    assert.equal(carolUnread.rooms.some((r) => r.roomId === first.roomId), false);
    assert.deepEqual(store.broadcastAudience(first.roomId).slice().sort(), ['alice', 'bob']);
    assert.equal(store.broadcastAudience(PUBLIC_ROOM_ID), 'all');
  });

  it('keeps an OPSGPT DM conversation id off the Public Room path', () => {
    const store = open();
    const dm = store.getOrCreateOpsgptDm('alice');
    assert.equal(dm.ok, true);
    if (!dm.ok) return;
    store.setOpsgptConversationId('alice', 'chat-conv-1');
    assert.equal(store.getOpsgptConversationId('alice'), 'chat-conv-1');
    assert.equal(store.getOpsgptConversationId('bob'), null);
    const pending = store.postOpsgptMessage({
      roomId: dm.roomId,
      body: '',
      status: 'pending',
    });
    const done = store.updateMessage({
      id: pending.id,
      body: '## 發現\n穩健',
      status: 'complete',
      orchestratorTurnId: 'turn-1',
    });
    assert.equal(done?.status, 'complete');
    assert.equal(done?.authorId, OPSGPT_PARTICIPANT_ID);
  });
});
