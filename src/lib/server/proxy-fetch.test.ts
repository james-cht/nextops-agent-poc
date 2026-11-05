import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { dispatcherFromEnv, fetchWithDispatcher, proxyFetch } from './proxy-fetch.ts';

function errorBlob(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let i = 0; i < 5 && current; i += 1) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(' ');
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve(addr.port);
        return;
      }
      reject(new Error('server did not bind a port'));
    });
    server.on('error', reject);
  });
}

describe('proxyFetch', () => {
  const prevEnabled = process.env.PUBLIC_DEFAULT_PROXY_ENABLED;
  const prevHost = process.env.PUBLIC_DEFAULT_PROXY_HOST;
  const prevPort = process.env.PUBLIC_DEFAULT_PROXY_PORT;

  before(() => {
    process.env.PUBLIC_DEFAULT_PROXY_ENABLED = 'false';
    delete process.env.PUBLIC_DEFAULT_PROXY_HOST;
    delete process.env.PUBLIC_DEFAULT_PROXY_PORT;
  });

  after(() => {
    if (prevEnabled === undefined) delete process.env.PUBLIC_DEFAULT_PROXY_ENABLED;
    else process.env.PUBLIC_DEFAULT_PROXY_ENABLED = prevEnabled;
    if (prevHost === undefined) delete process.env.PUBLIC_DEFAULT_PROXY_HOST;
    else process.env.PUBLIC_DEFAULT_PROXY_HOST = prevHost;
    if (prevPort === undefined) delete process.env.PUBLIC_DEFAULT_PROXY_PORT;
    else process.env.PUBLIC_DEFAULT_PROXY_PORT = prevPort;
  });

  it('does not fail a non-loopback Prometheus URL with agent.dispatch is not a function', async () => {
    // Production Site overview used a Node HTTP proxy agent as undici's dispatcher.
    // That throws before any packet leaves the box. Direct Upstream Access must
    // use undici fetch (optionally EnvHttpProxyAgent), never http-proxy-agent.
    try {
      await proxyFetch('http://203.0.113.1/api/v1/query?query=up', {
        signal: AbortSignal.timeout(400),
      });
    } catch (error) {
      assert.doesNotMatch(errorBlob(error), /dispatch is not a function/);
    }
  });

  it('fetches a loopback upstream without a proxy dispatcher', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
    });
    const port = await listen(server);
    try {
      const res = await proxyFetch(`http://127.0.0.1:${port}/health`);
      assert.equal(res.status, 200);
      assert.equal(await res.text(), 'ok');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it('ignores a Node HTTP agent that lacks dispatch() instead of throwing', async () => {
    const fakeNodeAgent = { sockets: {}, requests: {} };
    try {
      await fetchWithDispatcher(
        'http://203.0.113.1/api/v1/query?query=up',
        { signal: AbortSignal.timeout(400) },
        fakeNodeAgent as never,
      );
    } catch (error) {
      assert.doesNotMatch(errorBlob(error), /dispatch is not a function/);
    }
  });
});

describe('dispatcherFromEnv', () => {
  it('is null when Direct Upstream Access is on', () => {
    assert.equal(dispatcherFromEnv({ PUBLIC_DEFAULT_PROXY_ENABLED: 'false' }), null);
    assert.equal(dispatcherFromEnv({}), null);
  });

  it('returns an undici dispatcher when the HTTP proxy is explicitly opted in', () => {
    const dispatcher = dispatcherFromEnv({
      PUBLIC_DEFAULT_PROXY_ENABLED: 'true',
      PUBLIC_DEFAULT_PROXY_HOST: '192.0.2.1',
      PUBLIC_DEFAULT_PROXY_PORT: '808',
    });
    assert.equal(typeof dispatcher?.dispatch, 'function');
  });
});
