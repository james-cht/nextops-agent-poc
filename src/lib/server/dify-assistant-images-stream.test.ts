import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AssistantImagesSseEnricher,
  buildImageAllowlist,
  formatAssistantImagesSseEvent,
} from './dify-assistant-images-stream.ts';

function parseSseBlocks(raw: string): Array<{ event: string; data: unknown }> {
  return raw
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      let event = '';
      let dataStr = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        else if (line.startsWith('data: ')) dataStr = line.slice(6);
      }
      return { event, data: dataStr ? JSON.parse(dataStr) : null };
    });
}

describe('buildImageAllowlist', () => {
  it('unions env hosts with hostname from media base URL', () => {
    const set = buildImageAllowlist({
      mediaBaseUrl: 'https://aiot.corp.example.com/gemini-ct',
      allowlistEnv: 'cdn.example.com, img.ops.local',
    });
    assert.ok(set.has('aiot.corp.example.com'));
    assert.ok(set.has('cdn.example.com'));
    assert.ok(set.has('img.ops.local'));
  });
});

describe('AssistantImagesSseEnricher', () => {
  const allowlist = new Set(['cdn.example.com']);

  it('passes through message events unchanged before message_end', () => {
    const enricher = new AssistantImagesSseEnricher(allowlist);
    const out = enricher.push(
      'event: message\ndata: {"answer":"Hello "}\n\nevent: message\ndata: {"answer":"world"}\n\n',
    );
    const events = parseSseBlocks(out);
    assert.equal(events.length, 2);
    assert.equal(events[0].event, 'message');
    assert.equal((events[0].data as { answer: string }).answer, 'Hello ');
    assert.equal(events[1].event, 'message');
    assert.equal((events[1].data as { answer: string }).answer, 'world');
  });

  it('emits assistant_images after message_end with allowlisted images from answer text', () => {
    const enricher = new AssistantImagesSseEnricher(allowlist);
    enricher.push(
      'event: agent_message\ndata: {"answer":"See ![x](https://cdn.example.com/a.png) and ![y](https://evil.example/b.png)"}\n\n',
    );
    const out = enricher.push(
      'event: message_end\ndata: {"conversation_id":"conv-1"}\n\n',
    );
    const events = parseSseBlocks(out);
    assert.equal(events[0].event, 'message_end');
    assert.equal(events[1].event, 'assistant_images');
    const payload = events[1].data as {
      images: Array<{ url: string }>;
      blocked: Array<{ host: string }>;
      truncated: boolean;
      textSanitized: string;
    };
    assert.deepEqual(payload.images.map((i) => i.url), ['https://cdn.example.com/a.png']);
    assert.equal(payload.blocked[0].host, 'evil.example');
    assert.equal(payload.truncated, false);
    assert.equal(payload.textSanitized.includes('!['), false);
    assert.equal(payload.textSanitized.includes('See'), true);
  });

  it('includes native file remote_url from message events when allowlisted', () => {
    const enricher = new AssistantImagesSseEnricher(allowlist);
    enricher.push(
      'event: message\ndata: {"answer":"ok","files":[{"type":"image","transfer_method":"remote_url","url":"https://cdn.example.com/native.png"}]}\n\n',
    );
    const out = enricher.push('event: message_end\ndata: {"conversation_id":"c2"}\n\n');
    const events = parseSseBlocks(out);
    const payload = events.find((e) => e.event === 'assistant_images')?.data as {
      images: Array<{ url: string }>;
    };
    assert.ok(payload);
    assert.deepEqual(payload.images.map((i) => i.url), [
      'https://cdn.example.com/native.png',
    ]);
  });
});

describe('formatAssistantImagesSseEvent', () => {
  it('formats a valid SSE event block', () => {
    const block = formatAssistantImagesSseEvent({
      text: 'hi',
      images: [{ url: 'https://cdn.example.com/a.png' }],
      blocked: [],
      truncated: false,
    });
    assert.match(block, /^event: assistant_images\n/);
    assert.match(block, /\n\n$/);
    const events = parseSseBlocks(block);
    assert.equal(events[0].event, 'assistant_images');
    assert.equal((events[0].data as { textSanitized: string }).textSanitized, 'hi');
  });
});
