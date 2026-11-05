import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { appendConfigAuditEntry } from '$lib/server/config-audit-log';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';
import { proxyDailyCheck } from '$lib/server/daily-check-routes';

const handle: RequestHandler = async ({ request, params, url, locals }) => {
  const path = (params.path ?? '').replace(/^\/+/, '');
  let body: unknown;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      body = await request.json();
    } catch {
      body = {};
    }
  }
  const store = await ensureAppLocalSettings().catch(() => null);
  const result = await proxyDailyCheck({
    baseUrl: env.DAILY_CHECK_BASE_URL || 'http://127.0.0.1:3300',
    method: request.method,
    path,
    search: url.search,
    body,
    actor: locals.operatorKey || 'unknown',
    audit: (entry) => {
      appendConfigAuditEntry(
        {
          action: 'save',
          setting: entry.setting,
          outcome: entry.outcome,
          actor: entry.actor,
          detail: entry.detail,
        },
        store ? { store } : {},
      );
    },
  });
  if (result.body instanceof Uint8Array) {
    const copy = new Uint8Array(result.body.byteLength);
    copy.set(result.body);
    return new Response(copy.buffer, {
      status: result.status,
      headers: { 'content-type': result.contentType || 'application/octet-stream' },
    });
  }
  if (typeof result.body === 'string' && result.contentType.includes('html')) {
    return new Response(result.body, {
      status: result.status,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
  return json(result.body ?? {}, { status: result.status });
};

export const GET = handle;
export const POST = handle;
