import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  addChatClient,
  broadcastChatEvent,
  chatClientCount,
  encodeChatSse,
  _resetChatHubForTests,
} from './operator-chat-hub.ts';
import type { ChatMessage } from './operator-chat-store.ts';

afterEach(() => {
  _resetChatHubForTests();
});

function fakeMessage(): ChatMessage {
  return {
    id: 'm1',
    roomId: 'public',
    authorId: 'ops',
    body: 'hello',
    status: 'complete',
    orchestratorTurnId: null,
    assistantImages: null,
    createdAt: '2026-09-03T12:00:00.000Z',
  };
}

describe('Operator Chat SSE hub', () => {
  it('does not dump history on connect — encode is a single event frame', () => {
    const frame = encodeChatSse({ type: 'hello', ts: '2026-09-03T12:00:00.000Z' });
    assert.equal(frame.startsWith('data: '), true);
    assert.equal(frame.includes('"type":"hello"'), true);
    assert.equal(frame.includes('"messages"'), false);
  });

  it('broadcasts message events only to currently connected clients', () => {
    const chunks: string[] = [];
    const controller = {
      enqueue(s: string) {
        chunks.push(s);
      },
    } as ReadableStreamDefaultController<string>;
    const cleanup = addChatClient(controller);
    assert.equal(chatClientCount(), 1);
    broadcastChatEvent({ type: 'message', message: fakeMessage() });
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]?.includes('"type":"message"'), true);
    assert.equal(chunks[0]?.includes('hello'), true);
    cleanup();
    broadcastChatEvent({ type: 'message', message: fakeMessage() });
    assert.equal(chunks.length, 1);
    assert.equal(chatClientCount(), 0);
  });

  it('does not enqueue DM bodies to Operator Accounts outside the audience', () => {
    const alice: string[] = [];
    const carol: string[] = [];
    addChatClient(
      { enqueue(s: string) { alice.push(s); } } as ReadableStreamDefaultController<string>,
      'alice',
    );
    addChatClient(
      { enqueue(s: string) { carol.push(s); } } as ReadableStreamDefaultController<string>,
      'carol',
    );
    broadcastChatEvent(
      { type: 'message', message: { ...fakeMessage(), roomId: 'dm-1', body: 'secret' } },
      { to: ['alice', 'bob'] },
    );
    assert.equal(alice.some((c) => c.includes('secret')), true);
    assert.equal(carol.some((c) => c.includes('secret')), false);
  });
});
