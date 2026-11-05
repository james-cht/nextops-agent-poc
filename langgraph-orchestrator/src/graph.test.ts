import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { openConversationStore } from './conversations.ts';
import { createDiagnosisGraph } from './graph.ts';
import { NextOpsClient } from './nextops-client.ts';
import { openOrchestratorSettingsStore } from './settings.ts';
import { openTraceStore } from './traces.ts';

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('createDiagnosisGraph traces', () => {
  it('asks the GE Agent instead of AiBridge and returns that answer', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-graph-'));
    dirs.push(d);
    const conversations = openConversationStore(path.join(d, 'c.sqlite'));
    const settings = openOrchestratorSettingsStore(path.join(d, 's.sqlite'));
    settings.seedOnce({ employeeId: '', model: 'gemini-2.5-flash-lite' });
    const tools = new NextOpsClient({
      toolBase: 'http://nextops.test',
      toolToken: 'secret-token',
      fetchTimeoutMs: 5_000,
      fetchImpl: async (url) => {
        const href = String(url);
        if (href.endsWith('/api/sites')) {
          return new Response(JSON.stringify([{ siteId: 'lh', title: '龍華' }]), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      },
    });
    const graph = createDiagnosisGraph({
      tools,
      conversations,
      settings,
      aibridgeBaseUrl: 'http://aibridge.test',
      fetchTimeoutMs: 5_000,
      geAgentProject: 'ebg-proj-ge-aiops-prd',
      geAgentLocation: 'global',
      geAgentEngine: 'gemini-enterprise-aiops_1789692074759',
      geAgentId: '2385562009475238061',
      geAgentAccessToken: 'ya29.test',
    });
    let seenUrl = '';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url) => {
      seenUrl = String(url);
      return new Response(
        '{"answer":{"state":"SUCCEEDED","replies":[{"groundedContent":{"content":{"text":"龍華 CPU 偏高"}}}]}}\n',
        { status: 200 },
      );
    }) as typeof fetch;
    try {
      const result = await graph.run({ query: '龍華 CPU', operatorUsername: 'ops' });
      assert.equal(result.answer, '龍華 CPU 偏高');
      assert.equal(
        seenUrl,
        'https://discoveryengine.googleapis.com/v1alpha/projects/ebg-proj-ge-aiops-prd/locations/global/collections/default_collection/engines/gemini-enterprise-aiops_1789692074759/assistants/default_assistant:streamAssist',
      );
    } finally {
      globalThis.fetch = originalFetch;
      conversations.close();
      settings.close();
    }
  });

  it('writes a Trace with three observation kinds (fail-open store)', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-graph-'));
    dirs.push(d);
    const conversations = openConversationStore(path.join(d, 'c.sqlite'));
    const traces = openTraceStore(path.join(d, 't.sqlite'));
    const settings = openOrchestratorSettingsStore(path.join(d, 's.sqlite'));
    settings.seedOnce({ employeeId: 'emp', model: 'gemini-2.5-flash-lite' });
    const tools = new NextOpsClient({
      toolBase: 'http://nextops.test',
      toolToken: 'secret-token',
      fetchTimeoutMs: 5_000,
      fetchImpl: async (url) => {
        const href = String(url);
        if (href.endsWith('/api/sites')) {
          return new Response(JSON.stringify([{ siteId: 'lh', title: '龍華' }]), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      },
    });
    const graph = createDiagnosisGraph({
      tools,
      conversations,
      settings,
      aibridgeBaseUrl: 'http://aibridge.test',
      fetchTimeoutMs: 5_000,
      traces,
      geAgentProject: 'ebg-proj-ge-aiops-prd',
      geAgentLocation: 'global',
      geAgentEngine: 'gemini-enterprise-aiops_1789692074759',
      geAgentId: '2385562009475238061',
      geAgentAccessToken: 'ya29.test',
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 8, completion_tokens: 2 } }), {
        status: 200,
      })) as typeof fetch;
    try {
      const result = await graph.run({
        query: '龍華 CPU',
        operatorUsername: 'ops',
        modelRates: { 'gemini-2.5-flash-lite': { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4 } },
      });
      assert.match(result.answer, /ok/);
      const listed = traces.list();
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.operatorUsername, 'ops');
      const full = traces.get(listed[0]!.id);
      const kinds = full?.observations.map((o) => o.kind) ?? [];
      assert.ok(kinds.includes('tool_endpoint'));
      assert.ok(kinds.includes('context_reduction'));
      assert.ok(kinds.includes('aibridge_gateway'));
      assert.equal(full?.usage.source, 'recorded');
      const dumped = JSON.stringify(full);
      assert.equal(dumped.includes('secret-token'), false);
    } finally {
      globalThis.fetch = originalFetch;
      conversations.close();
      traces.close();
      settings.close();
    }
  });

  it('still returns a Diagnosis Answer if Trace persist throws', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-graph-'));
    dirs.push(d);
    const conversations = openConversationStore(path.join(d, 'c.sqlite'));
    const settings = openOrchestratorSettingsStore(path.join(d, 's.sqlite'));
    settings.seedOnce({ employeeId: 'emp', model: 'gemini-2.5-flash-lite' });
    const tools = new NextOpsClient({
      toolBase: 'http://nextops.test',
      toolToken: 'secret-token',
      fetchTimeoutMs: 5_000,
      fetchImpl: async () => new Response('[]', { status: 200 }),
    });
    const graph = createDiagnosisGraph({
      tools,
      conversations,
      settings,
      aibridgeBaseUrl: 'http://aibridge.test',
      fetchTimeoutMs: 5_000,
      geAgentProject: 'ebg-proj-ge-aiops-prd',
      geAgentLocation: 'global',
      geAgentEngine: 'gemini-enterprise-aiops_1789692074759',
      geAgentId: '2385562009475238061',
      geAgentAccessToken: 'ya29.test',
      traces: {
        close() {},
        get() {
          return null;
        },
        list() {
          return [];
        },
        prune() {},
        put() {
          throw new Error('disk full');
        },
      },
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'still-ok' } }] }), {
        status: 200,
      })) as typeof fetch;
    try {
      const result = await graph.run({ query: 'hello' });
      assert.match(result.answer, /still-ok/);
    } finally {
      globalThis.fetch = originalFetch;
      conversations.close();
      settings.close();
    }
  });
});
