import assert from 'node:assert/strict';
import test from 'node:test';
import { geAgentChat } from './ge-agent.ts';

test('geAgentChat asks the Gemini Enterprise agent with streamAssist and returns the final answer', async () => {
  let seenUrl = '';
  let seenAuth = '';
  let seenProject = '';
  let seenBody = '';
  const stream = [
    JSON.stringify({
      answer: {
        state: 'IN_PROGRESS',
        replies: [{ groundedContent: { content: { text: '龍' } } }],
      },
    }),
    JSON.stringify({
      statusUpdate: { updateText: '正在閱讀站點資料' },
    }),
    JSON.stringify({
      answer: {
        state: 'SUCCEEDED',
        replies: [{ groundedContent: { content: { text: '龍華 CPU 偏高' } } }],
      },
    }),
  ].join('\n');

  const result = await geAgentChat({
    projectId: 'ebg-proj-ge-aiops-prd',
    location: 'global',
    engineId: 'gemini-enterprise-aiops_1789692074759',
    agentId: '2385562009475238061',
    message: '龍華 CPU\n\n[CONTEXT]\nsiteId=lh',
    timeoutMs: 5_000,
    accessToken: 'ya29.test',
    fetchImpl: async (url, init) => {
      seenUrl = String(url);
      const headers = init?.headers as Record<string, string> | undefined;
      seenAuth = headers?.Authorization ?? '';
      seenProject = headers?.['x-goog-user-project'] ?? '';
      seenBody = String(init?.body ?? '');
      return new Response(stream, { status: 200 });
    },
  });

  assert.equal(
    seenUrl,
    'https://discoveryengine.googleapis.com/v1alpha/projects/ebg-proj-ge-aiops-prd/locations/global/collections/default_collection/engines/gemini-enterprise-aiops_1789692074759/assistants/default_assistant:streamAssist',
  );
  assert.equal(seenAuth, 'Bearer ya29.test');
  assert.equal(seenProject, 'ebg-proj-ge-aiops-prd');
  const body = JSON.parse(seenBody) as {
    query: { text: string };
    agentsSpec: { agentSpecs: Array<{ agentId: string }> };
  };
  assert.equal(body.query.text.includes('龍華 CPU'), true);
  assert.deepEqual(body.agentsSpec.agentSpecs, [{ agentId: '2385562009475238061' }]);
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.content, '龍華 CPU 偏高');
});
