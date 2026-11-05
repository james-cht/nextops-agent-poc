import test from 'node:test';
import assert from 'node:assert/strict';
import { aibridgeChat, extractContent } from './aibridge.ts';
import { NextOpsClient } from './nextops-client.ts';

test('extractContent returns assistant message from OpenAI-like payload', () => {
  const raw = JSON.stringify({
    choices: [{ message: { content: 'hello' } }],
  });
  assert.equal(extractContent(raw), 'hello');
});

test('extractContent ignores image-generation-shaped fields and keeps text only', () => {
  const raw = JSON.stringify({
    choices: [
      {
        message: {
          content: '過去12小時 CPU 偏高',
          images: [{ url: 'https://example.com/cpu.png' }],
        },
      },
    ],
    data: [{ b64_json: 'iVBORw0KGgo=' }],
  });
  assert.equal(extractContent(raw), '過去12小時 CPU 偏高');
});

test('aibridgeChat posts text-only unified/chat fields (no file, no image modality)', async () => {
  const keys: string[] = [];
  const result = await aibridgeChat({
    baseUrl: 'http://aibridge.test',
    employeeId: 'emp',
    model: 'gemini-2.5-flash-lite',
    question: '輸出過去12小時的CPU使用趨勢圖',
    systemPrompt: 'sys',
    timeoutMs: 5_000,
    fetchImpl: async (_url, init) => {
      const body = init?.body;
      assert.ok(body instanceof FormData);
      keys.push(...body.keys());
      return new Response(JSON.stringify({ choices: [{ message: { content: '僅文字摘要' } }] }), {
        status: 200,
      });
    },
  });
  keys.sort();
  assert.deepEqual(keys, ['employee_id', 'model', 'question', 'system_prompt']);
  assert.equal(result.content, '僅文字摘要');
});

test('Diagnosis Graph tools have no Prometheus range/query_range path', () => {
  const methods = Object.getOwnPropertyNames(NextOpsClient.prototype)
    .filter((n) => n !== 'constructor')
    .sort();
  assert.deepEqual(methods, ['describeSite', 'get', 'getSiteOverview', 'getSiteResourceHealth', 'listSites']);
});

test('extractContent falls back to raw text on non-json response', () => {
  assert.equal(extractContent('plain text'), 'plain text');
});
