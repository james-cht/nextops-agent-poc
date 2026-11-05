import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { probeToolEndpointToken } from './dify-credential-probes.ts';

describe('probeToolEndpointToken', () => {
  it('succeeds when bearer self-check returns 200', async () => {
    const result = await probeToolEndpointToken({
      toolToken: 'secret-tok',
      origin: 'http://127.0.0.1:3000',
      fetchImpl: async (url, init) => {
        assert.match(String(url), /\/api\/sites$/);
        assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer secret-tok');
        return new Response('[]', { status: 200 });
      },
    });
    assert.equal(result.ok, true);
  });

  it('fails on 401', async () => {
    const result = await probeToolEndpointToken({
      toolToken: 'bad',
      origin: 'http://127.0.0.1:3000',
      fetchImpl: async () => new Response('no', { status: 401 }),
    });
    assert.equal(result.ok, false);
  });
});
