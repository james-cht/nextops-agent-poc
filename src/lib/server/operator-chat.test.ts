import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  _awaitChatAiForTests,
  getChatUnreadSummary,
  listRoomMessages,
  markPublicRoomRead,
  openOperatorDm,
  openOpsgptDm,
  postChatMessage,
  postPublicHumanMessage,
} from './operator-chat.ts';
import { _resetChatHubForTests, addChatClient } from './operator-chat-hub.ts';
import { _setChatOrchestratorForTests } from './operator-chat-orchestrator.ts';
import { _resetHumanChatRateForTests } from './operator-chat-rate.ts';
import {
  _openOperatorChatStoreForTests,
  _resetOperatorChatStoreForTests,
  getOperatorChatStore,
} from './operator-chat-store.ts';

const dirs: string[] = [];

afterEach(async () => {
  await _awaitChatAiForTests();
  _resetChatHubForTests();
  _resetHumanChatRateForTests();
  _resetOperatorChatStoreForTests();
  _setChatOrchestratorForTests(null);
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function openStore(): void {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-chat-svc-'));
  dirs.push(d);
  _openOperatorChatStoreForTests(path.join(d, 'operator-chat.sqlite'));
}

describe('postPublicHumanMessage', () => {
  it('persists then broadcasts a Chat SSE message event', () => {
    openStore();
    const chunks: string[] = [];
    addChatClient({
      enqueue(s: string) {
        chunks.push(s);
      },
    } as ReadableStreamDefaultController<string>);

    const posted = postPublicHumanMessage({ authorId: 'ops', body: 'ping' });
    assert.equal(posted.ok, true);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]?.includes('"type":"message"'), true);
    assert.equal(chunks[0]?.includes('ping'), true);
  });

  it('does not persist when the human rate limit is exceeded', () => {
    openStore();
    const t0 = new Date('2026-09-03T12:00:00.000Z');
    for (let i = 0; i < 20; i++) {
      const r = postPublicHumanMessage({ authorId: 'ops', body: `m${i}`, now: t0 });
      assert.equal(r.ok, true);
    }
    const blocked = postPublicHumanMessage({ authorId: 'ops', body: 'nope', now: t0 });
    assert.equal(blocked.ok, false);
    if (blocked.ok) return;
    assert.equal(blocked.code, 'RATE_LIMITED');
  });
});

describe('Operator Chat unread facade', () => {
  it('marks the author read on send and lets another account clear Public Room unread', () => {
    openStore();
    const posted = postPublicHumanMessage({ authorId: 'alice', body: 'ping' });
    assert.equal(posted.ok, true);
    assert.equal(getChatUnreadSummary('alice').unreadRoomCount, 0);
    assert.equal(getChatUnreadSummary('bob').unreadRoomCount, 1);
    markPublicRoomRead('bob');
    assert.equal(getChatUnreadSummary('bob').unreadRoomCount, 0);
  });
});

describe('Operator DM privacy', () => {
  it('does not broadcast an Operator DM body to a third Chat SSE client', () => {
    openStore();
    const opened = openOperatorDm('alice', 'bob');
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const alice: string[] = [];
    const owner: string[] = [];
    addChatClient(
      { enqueue(s: string) { alice.push(s); } } as ReadableStreamDefaultController<string>,
      'alice',
    );
    addChatClient(
      { enqueue(s: string) { owner.push(s); } } as ReadableStreamDefaultController<string>,
      'owner',
    );
    const posted = postChatMessage({
      authorId: 'alice',
      roomId: opened.roomId,
      body: 'secret-handoff',
      role: 'operator',
    });
    assert.equal(posted.ok, true);
    assert.equal(alice.some((c) => c.includes('secret-handoff')), true);
    assert.equal(owner.some((c) => c.includes('secret-handoff')), false);
    const forbidden = postChatMessage({
      authorId: 'owner',
      roomId: opened.roomId,
      body: 'peek',
      role: 'platform_owner',
    });
    assert.equal(forbidden.ok, false);
    if (forbidden.ok) return;
    assert.equal(forbidden.code, 'FORBIDDEN');
  });
});

describe('Public Room @OPSGPT', () => {
  it('posts a pending OPSGPT message then a Diagnosis Answer without the appendix', async () => {
    openStore();
    _setChatOrchestratorForTests({
      async runTurn(opts) {
        assert.equal(opts.conversationId, '');
        assert.equal(opts.query, '龍華 CPU');
        return {
          answer: '## 發現\n穩健\n\n## 詳細資料\n節點 JSON',
          conversationId: 'public-turn-1',
        };
      },
    });
    const posted = postPublicHumanMessage({
      authorId: 'alice',
      body: '@OPSGPT 龍華 CPU',
      role: 'operator',
    });
    assert.equal(posted.ok, true);
    if (!posted.ok) return;
    assert.equal(posted.aiMessage?.status, 'pending');
    await _awaitChatAiForTests();
    const page = listRoomMessages({ roomId: 'public' });
    const reply = page.messages.find((m) => m.authorId === 'participant:opsgpt');
    assert.equal(reply?.status, 'complete');
    assert.equal(reply?.body.includes('穩健'), true);
    assert.equal(reply?.body.includes('詳細資料'), false);
    assert.equal(reply?.body.includes('節點 JSON'), false);
    assert.equal(getOperatorChatStore().getOpsgptConversationId('alice'), null);
  });

  it('stores Viewer @OPSGPT as human text and does not start a turn', async () => {
    openStore();
    let called = 0;
    _setChatOrchestratorForTests({
      async runTurn() {
        called += 1;
        return { answer: 'nope', conversationId: 'x' };
      },
    });
    const posted = postPublicHumanMessage({
      authorId: 'viewer1',
      body: '@OPSGPT 不該問',
      role: 'viewer',
    });
    assert.equal(posted.ok, true);
    if (!posted.ok) return;
    assert.equal(posted.aiMessage, undefined);
    await _awaitChatAiForTests();
    assert.equal(called, 0);
    assert.equal(listRoomMessages({ roomId: 'public' }).messages.length, 1);
  });

  it('rejects a second Operator Chat AI invoke while one is pending', async () => {
    openStore();
    let releaseHang: (value: { answer: string; conversationId: string }) => void = () => {};
    _setChatOrchestratorForTests({
      runTurn() {
        return new Promise((resolve) => {
          releaseHang = resolve;
        });
      },
    });
    const first = postPublicHumanMessage({
      authorId: 'alice',
      body: '@OPSGPT one',
      role: 'operator',
    });
    assert.equal(first.ok, true);
    const second = postPublicHumanMessage({
      authorId: 'alice',
      body: '@OPSGPT two',
      role: 'operator',
    });
    assert.equal(second.ok, false);
    if (second.ok) return;
    assert.equal(second.code, 'PENDING');
    const dm = openOpsgptDm('alice');
    assert.equal(dm.ok, true);
    if (dm.ok) {
      const fromDm = postChatMessage({
        authorId: 'alice',
        roomId: dm.roomId,
        body: 'also locked',
        role: 'operator',
      });
      assert.equal(fromDm.ok, false);
      if (!fromDm.ok) assert.equal(fromDm.code, 'PENDING');
    }
    releaseHang({ answer: 'ok', conversationId: 'x' });
    await _awaitChatAiForTests();
  });
});

describe('OPSGPT DM', () => {
  it('reuses a chat-scoped conversation id and never reads an /ai id', async () => {
    openStore();
    const seen: string[] = [];
    _setChatOrchestratorForTests({
      async runTurn(opts) {
        seen.push(opts.conversationId);
        return {
          answer: `turn ${seen.length}`,
          conversationId: seen.length === 1 ? 'chat-dm-1' : 'chat-dm-1',
        };
      },
    });
    const dm = openOpsgptDm('alice');
    assert.equal(dm.ok, true);
    if (!dm.ok) return;
    const first = postChatMessage({
      authorId: 'alice',
      roomId: dm.roomId,
      body: 'first',
      role: 'operator',
    });
    assert.equal(first.ok, true);
    await _awaitChatAiForTests();
    const second = postChatMessage({
      authorId: 'alice',
      roomId: dm.roomId,
      body: 'second',
      role: 'operator',
    });
    assert.equal(second.ok, true);
    await _awaitChatAiForTests();
    assert.deepEqual(seen, ['', 'chat-dm-1']);
  });

  it('rejects Viewer sends and does not invoke from an Operator DM @OPSGPT', async () => {
    openStore();
    let called = 0;
    _setChatOrchestratorForTests({
      async runTurn() {
        called += 1;
        return { answer: 'nope', conversationId: 'x' };
      },
    });
    const opsgpt = openOpsgptDm('viewer1');
    assert.equal(opsgpt.ok, true);
    if (!opsgpt.ok) return;
    const viewerSend = postChatMessage({
      authorId: 'viewer1',
      roomId: opsgpt.roomId,
      body: 'hi',
      role: 'viewer',
    });
    assert.equal(viewerSend.ok, false);
    if (viewerSend.ok) return;
    assert.equal(viewerSend.code, 'VIEWER');

    const pair = openOperatorDm('alice', 'bob');
    assert.equal(pair.ok, true);
    if (!pair.ok) return;
    const dm = postChatMessage({
      authorId: 'alice',
      roomId: pair.roomId,
      body: '@OPSGPT ping',
      role: 'operator',
    });
    assert.equal(dm.ok, true);
    await _awaitChatAiForTests();
    assert.equal(called, 0);
  });
});
