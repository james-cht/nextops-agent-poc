import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextOpsClient, toolResultText } from './nextops-client.ts';

describe('NextOpsClient', () => {
  it('listSites GETs /api/sites with Bearer', async () => {
    const calls: { url: string; auth: string | null }[] = [];
    const client = new NextOpsClient({
      toolBase: 'http://nextops:3000/',
      toolToken: 'tok-abc',
      fetchTimeoutMs: 5000,
      fetchImpl: async (input, init) => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        calls.push({ url, auth: headers.get('Authorization') });
        return new Response(JSON.stringify([{ siteId: '龍華', title: '龍華' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    const result = await client.listSites();
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://nextops:3000/api/sites');
    assert.equal(calls[0].auth, 'Bearer tok-abc');
    assert.match(result.bodyText, /龍華/);
  });

  it('URL-encodes siteId for resource-health', async () => {
    let seen = '';
    const client = new NextOpsClient({
      toolBase: 'http://127.0.0.1:3000',
      toolToken: 't',
      fetchTimeoutMs: 5000,
      fetchImpl: async (input) => {
        seen = String(input);
        return new Response('{}', { status: 200 });
      },
    });
    await client.getSiteResourceHealth('龍華');
    assert.equal(seen, 'http://127.0.0.1:3000/api/sites/%E9%BE%8D%E8%8F%AF/resource-health');
  });

  it('toolResultText wraps non-OK bodies', () => {
    const text = toolResultText({
      ok: false,
      status: 404,
      bodyText: JSON.stringify({ error: 'SITE_NOT_FOUND' }),
    });
    const parsed = JSON.parse(text);
    assert.equal(parsed.error, true);
    assert.equal(parsed.status, 404);
    assert.equal(parsed.body.error, 'SITE_NOT_FOUND');
  });
});

describe('loadConfig', async () => {
  const { loadConfig } = await import('./config.ts');

  it('requires NEXTOPS_DIFY_TOKEN', () => {
    assert.throws(() => loadConfig({} as NodeJS.ProcessEnv), /NEXTOPS_DIFY_TOKEN/);
  });

  it('defaults toolBase and port', () => {
    const c = loadConfig({ NEXTOPS_DIFY_TOKEN: 'x' } as NodeJS.ProcessEnv);
    assert.equal(c.toolBase, 'http://127.0.0.1:3000');
    assert.equal(c.port, 3100);
  });
});
