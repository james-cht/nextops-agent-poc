import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { proxyDailyCheck } from './daily-check-routes.ts';

describe('daily check proxy', () => {
  it('forwards an explicit run without turning on send flags', async () => {
    const seen: { url: string; body: string }[] = [];
    const audits: { setting: string; actor: string; outcome: string }[] = [];
    const result = await proxyDailyCheck({
      baseUrl: 'http://daily-check-report:3300/',
      method: 'POST',
      path: 'run',
      body: { date: '2026-10-13' },
      actor: 'james',
      fetchImpl: async (url, init) => {
        seen.push({ url: String(url), body: String(init?.body ?? '') });
        return new Response(JSON.stringify({ overall: 'WARN', counts: { WARN: 1 } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
      audit: (entry) => audits.push(entry),
    });
    assert.equal(result.status, 200);
    assert.equal(seen[0].url, 'http://daily-check-report:3300/daily-check/run');
    const forwarded = JSON.parse(seen[0].body);
    assert.equal(forwarded.date, '2026-10-13');
    assert.notEqual(forwarded.send_gmail, true);
    assert.notEqual(forwarded.send_chat, true);
    assert.equal(audits[0].setting, 'daily_check.run');
    assert.equal(audits[0].actor, 'james');
    assert.equal(audits[0].outcome, 'saved');
  });

  it('audits an explicit gmail send and does not send on read', async () => {
    const audits: string[] = [];
    await proxyDailyCheck({
      baseUrl: 'http://127.0.0.1:3300',
      method: 'GET',
      path: 'latest',
      fetchImpl: async () => new Response(JSON.stringify({ date: '2026-10-13' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      audit: (entry) => audits.push(entry.setting),
    });
    assert.deepEqual(audits, []);

    await proxyDailyCheck({
      baseUrl: 'http://127.0.0.1:3300',
      method: 'POST',
      path: 'send',
      body: { channel: 'gmail', date: '2026-10-13' },
      actor: 'james',
      fetchImpl: async (_url, init) => {
        assert.equal(JSON.parse(String(init?.body)).channel, 'gmail');
        return new Response(JSON.stringify({ status: 'sent' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
      audit: (entry) => audits.push(entry.setting),
    });
    assert.deepEqual(audits, ['daily_check.send']);
  });

  it('returns 502 when the service is down and does not invent a report', async () => {
    const result = await proxyDailyCheck({
      baseUrl: 'http://127.0.0.1:3300',
      method: 'GET',
      path: 'latest',
      fetchImpl: async () => {
        throw new Error('connect ECONNREFUSED');
      },
    });
    assert.equal(result.status, 502);
    assert.equal(typeof result.body, 'object');
    const body = result.body as { error: string; report?: unknown };
    assert.match(body.error, /daily-check/);
    assert.equal(body.report, undefined);
  });

  it('passes png bytes through', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const result = await proxyDailyCheck({
      baseUrl: 'http://127.0.0.1:3300',
      method: 'GET',
      path: 'latest.png',
      fetchImpl: async (url) => {
        assert.equal(String(url), 'http://127.0.0.1:3300/daily-check/latest.png');
        return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
      },
    });
    assert.equal(result.status, 200);
    assert.equal(result.contentType, 'image/png');
    assert.ok(result.body instanceof Uint8Array);
    assert.equal((result.body as Uint8Array)[0], 0x89);
  });
});
