import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildAiQueryClientBody,
  buildDifyChatMessagesBody,
} from './dify-chat.ts';
import { createDifyStream } from './dify-client.ts';

describe('buildDifyChatMessagesBody', () => {
  it('includes empty conversation_id for a new thread', () => {
    const body = buildDifyChatMessagesBody({
      query: 'hello',
      siteId: 'cq-k8s-cluster',
      streaming: true,
    });
    assert.equal(body.conversation_id, '');
    assert.equal(body.query, 'hello');
    assert.equal(body.response_mode, 'streaming');
    assert.deepEqual(body.inputs, { site_id: 'cq-k8s-cluster' });
  });

  it('forwards conversation_id for multi-turn OPSGPT chat', () => {
    const body = buildDifyChatMessagesBody({
      query: 'follow up',
      siteId: '',
      streaming: true,
      conversationId: 'conv-abc',
    });
    assert.equal(body.conversation_id, 'conv-abc');
    assert.deepEqual(body.inputs, { site_id: '' });
  });

  it('uses blocking response_mode when streaming is false', () => {
    const body = buildDifyChatMessagesBody({
      query: 'q',
      siteId: 's1',
      streaming: false,
      conversationId: 'c1',
    });
    assert.equal(body.response_mode, 'blocking');
  });
});

describe('buildAiQueryClientBody', () => {
  it('omits conversationId when unset so the server starts a new Dify conversation', () => {
    const body = buildAiQueryClientBody({
      query: 'hello',
      siteId: 's1',
      streaming: true,
    });
    assert.equal(body.query, 'hello');
    assert.equal(body.siteId, 's1');
    assert.equal(body.streaming, true);
    assert.equal('conversationId' in body, false);
  });

  it('includes conversationId when continuing a chat room thread', () => {
    const body = buildAiQueryClientBody({
      query: 'next',
      siteId: '',
      streaming: true,
      conversationId: 'conv-1',
    });
    assert.equal(body.conversationId, 'conv-1');
  });
});

describe('createDifyStream conversation round-trip', () => {
  it('POSTs conversationId and surfaces conversation_id from message_end', async () => {
    let posted: unknown;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      posted = JSON.parse(String(init?.body ?? '{}'));
      const bytes = new TextEncoder().encode(
        'event: message\ndata: {"answer":"hi"}\n\nevent: message_end\ndata: {"conversation_id":"conv-from-dify"}\n\n',
      );
      return new Response(bytes, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }) as typeof fetch;

    try {
      const ended = await new Promise<string>((resolve, reject) => {
        createDifyStream({
          query: 'hello',
          siteId: 's1',
          conversationId: 'conv-prior',
          callbacks: {
            onEnd: (id) => resolve(id),
            onError: (err) => reject(new Error(err)),
          },
        });
      });
      assert.equal(ended, 'conv-from-dify');
      assert.equal((posted as { conversationId?: string }).conversationId, 'conv-prior');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
