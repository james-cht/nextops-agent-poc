export type GitLabAccessRecord = {
  username: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  updatedAt: string;
};

export function isGitLabAccessValid(
  access: GitLabAccessRecord | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!access?.accessToken) return false;
  if (!access.expiresAt) return true;
  return Date.parse(access.expiresAt) > now.getTime();
}

export function buildGitLabAuthorizeUrl(opts: {
  baseUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const base = opts.baseUrl.replace(/\/$/, '');
  const url = new URL(`${base}/oauth/authorize`);
  url.searchParams.set('client_id', opts.clientId);
  url.searchParams.set('redirect_uri', opts.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', opts.state);
  url.searchParams.set('scope', opts.scope ?? 'api read_user');
  return url.toString();
}

export type ExchangeResult =
  | {
      ok: true;
      accessToken: string;
      refreshToken: string | null;
      expiresAt: string | null;
    }
  | { ok: false; error: string };

export async function exchangeGitLabAuthorizationCode(opts: {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<ExchangeResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = opts.baseUrl.replace(/\/$/, '');
  try {
    const body = new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
      grant_type: 'authorization_code',
      redirect_uri: opts.redirectUri,
    });
    const res = await fetchImpl(`${base}/oauth/token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let detail = '';
      try {
        const parsed = JSON.parse(text) as { error?: unknown; error_description?: unknown };
        if (typeof parsed.error_description === 'string' && parsed.error_description.trim()) {
          detail = parsed.error_description.trim().slice(0, 200);
        } else if (typeof parsed.error === 'string' && parsed.error.trim()) {
          detail = parsed.error.trim();
        }
      } catch {
        if (text.trim()) detail = text.trim().slice(0, 200);
      }
      return {
        ok: false,
        error: `GitLab token exchange HTTP ${res.status}${detail ? `: ${detail}` : ''}`,
      };
    }
    const text = await res.text();
    const json = JSON.parse(text) as {
      access_token?: unknown;
      refresh_token?: unknown;
      expires_in?: unknown;
    };
    if (typeof json.access_token !== 'string' || !json.access_token) {
      return { ok: false, error: 'GitLab token exchange missing access_token' };
    }
    const now = opts.now ?? new Date();
    const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : null;
    const expiresAt =
      expiresIn != null ? new Date(now.getTime() + expiresIn * 1000).toISOString() : null;
    return {
      ok: true,
      accessToken: json.access_token,
      refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : null,
      expiresAt,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'GitLab token exchange failed',
    };
  }
}
