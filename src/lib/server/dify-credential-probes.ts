export type ProbeResult = { ok: true } | { ok: false; error: string };

export async function probeToolEndpointToken(opts: {
  toolToken: string;
  origin: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<ProbeResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const origin = opts.origin.replace(/\/$/, '');
  try {
    const res = await fetchImpl(`${origin}/api/sites`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${opts.toolToken}`,
      },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `Tool token probe HTTP ${res.status}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'probe failed';
    return { ok: false, error: msg };
  }
}
