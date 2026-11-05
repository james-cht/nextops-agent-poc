#!/usr/bin/env node
/**
 * Feedback loop for OPSGPT Dify connectivity (運維助手 fetch failed).
 * Usage:
 *   node scripts/diagnose-dify-loop.mjs              # bad-env repro only
 *   DIFY_BASE_URL=https://aiot-dev.corp.example.com/v1 \
 *   DIFY_API_KEY=app-... \
 *   node scripts/diagnose-dify-loop.mjs
 */
const badBase = 'http://localhost/v1';
const goodBase = process.env.DIFY_BASE_URL || '';
const goodKey = process.env.DIFY_API_KEY || '';

const nextopsBody = {
  inputs: { site_id: 'AMATA' },
  query: 'ping',
  response_mode: 'blocking',
  conversation_id: '',
  user: 'nextops-diagnose',
};

async function probe(label, baseUrl, apiKey) {
  const url = `${baseUrl.replace(/\/$/, '')}/chat-messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(nextopsBody),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    console.log(`[${label}] status=${res.status} body_prefix=${text.slice(0, 160).replace(/\s+/g, ' ')}`);
    return { ok: res.ok, status: res.status, message: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.log(`[${label}] SYMPTOM ${message}`);
    return { ok: false, status: 0, message };
  }
}

const bad = await probe('A-bad-localhost', badBase, 'demo-key');
if (bad.message !== 'fetch failed' && !String(bad.message || '').includes('fetch failed')) {
  console.error('LOOP FAIL: expected localhost to yield fetch failed');
  process.exit(2);
}
console.log('[A] PASS: reproduces UI symptom "fetch failed"');

if (!goodBase || !goodKey) {
  console.log('[B] SKIP: set DIFY_BASE_URL + DIFY_API_KEY to probe known-good');
  process.exit(0);
}

const good = await probe('B-configured', goodBase, goodKey);
if (!good.ok) {
  console.error('[B] FAIL: configured Dify did not accept NextOps-shaped body');
  process.exit(1);
}
console.log('[B] PASS: NextOps-shaped body works against configured Dify');
process.exit(0);
