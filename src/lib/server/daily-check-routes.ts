export type DailyCheckAudit = {
  setting: string;
  actor: string;
  outcome: 'saved' | 'rejected';
  detail?: Record<string, unknown>;
};

export type ProxyResult = {
  status: number;
  body: unknown;
  contentType: string;
};

const AUDITED: Record<string, string> = {
  'POST run': 'daily_check.run',
  'POST send': 'daily_check.send',
  'POST approvals': 'daily_check.approval',
};

export async function proxyDailyCheck(opts: {
  baseUrl: string;
  method: string;
  path: string;
  search?: string;
  body?: unknown;
  actor?: string;
  fetchImpl?: typeof fetch;
  audit?: (entry: DailyCheckAudit) => void;
}): Promise<ProxyResult> {
  const base = opts.baseUrl.replace(/\/$/, '');
  const path = opts.path.replace(/^\/+/, '');
  const url = `${base}/daily-check/${path}${opts.search ?? ''}`;
  const method = opts.method.toUpperCase();
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const headers: Record<string, string> = {};
    let body: string | undefined;
    if (opts.body !== undefined && method !== 'GET' && method !== 'HEAD') {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    const response = await fetchImpl(url, { method, headers, body });
    const contentType = (response.headers.get('content-type') || 'application/json').split(';')[0].trim();
    let parsed: unknown;
    if (contentType.startsWith('image/') || contentType === 'application/octet-stream') {
      parsed = new Uint8Array(await response.arrayBuffer());
    } else if (contentType.includes('html') || contentType.startsWith('text/')) {
      parsed = await response.text();
    } else {
      const text = await response.text();
      if (!text) parsed = null;
      else {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
      }
    }
    const setting = AUDITED[`${method} ${path}`];
    if (setting && opts.audit) {
      opts.audit({
        setting,
        actor: opts.actor || 'unknown',
        outcome: response.ok ? 'saved' : 'rejected',
        detail: { status: response.status, path },
      });
    }
    return { status: response.status, body: parsed, contentType };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'upstream error';
    return {
      status: 502,
      contentType: 'application/json',
      body: { error: `daily-check service unavailable: ${message}` },
    };
  }
}
