export type ProbeResult = { ok: true } | { ok: false; error: string };

/** Trim and strip a pasted `Bearer ` prefix — Read Access uses PRIVATE-TOKEN (PAT). */
export function normalizeGitLabReadToken(token: string): string {
  let t = token.trim();
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, '').trim();
  return t;
}

function noteGitLabProbeFailure(opts: {
  error: string;
  upstreamUrl: string;
}): void {
  void import('./upstream-diagnostic.ts')
    .then((m) =>
      m.recordUpstreamDiagnostic({
        service: 'GitLab',
        message: opts.error,
        detail: `URL: ${opts.upstreamUrl}`,
        upstreamUrl: opts.upstreamUrl,
        dependency: 'GitLab',
      }),
    )
    .catch(() => {
      /* tests run without the SvelteKit $lib alias */
    });
}

type OAuthErrorBody = {
  error?: unknown;
  error_description?: unknown;
};

function parseOAuthErrorBody(text: string): OAuthErrorBody {
  try {
    return JSON.parse(text) as OAuthErrorBody;
  } catch {
    return {};
  }
}

/**
 * Probe GitLab OAuth Client: OpenID discovery, then (when client credentials are
 * provided) a deliberate invalid authorization_code exchange. `invalid_grant` means
 * the client authenticated; `invalid_client` means unknown/wrong id or secret.
 */
export async function probeGitLabOAuthBase(opts: {
  baseUrl: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  fetchImpl?: typeof fetch;
}): Promise<ProbeResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = opts.baseUrl.replace(/\/$/, '');
  const discoveryUrl = `${base}/.well-known/openid-configuration`;
  try {
    const res = await fetchImpl(discoveryUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const error = `GitLab OAuth Client probe HTTP ${res.status}`;
      noteGitLabProbeFailure({ error, upstreamUrl: discoveryUrl });
      return { ok: false, error };
    }
    const body = (await res.json().catch(() => null)) as {
      authorization_endpoint?: unknown;
    } | null;
    if (typeof body?.authorization_endpoint !== 'string' || !body.authorization_endpoint) {
      const error = 'GitLab OAuth Client probe: not an OpenID issuer';
      noteGitLabProbeFailure({ error, upstreamUrl: discoveryUrl });
      return { ok: false, error };
    }

    const clientId = opts.clientId?.trim() ?? '';
    const clientSecret = opts.clientSecret?.trim() ?? '';
    const redirectUri = opts.redirectUri?.trim() ?? '';
    if (!clientId || !clientSecret || !redirectUri) {
      return { ok: true };
    }

    const tokenUrl = `${base}/oauth/token`;
    const tokenRes = await fetchImpl(tokenUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: 'nextops-oauth-probe-invalid',
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    const tokenText = await tokenRes.text().catch(() => '');
    const tokenJson = parseOAuthErrorBody(tokenText);
    const errCode = typeof tokenJson.error === 'string' ? tokenJson.error : '';
    const errDesc =
      typeof tokenJson.error_description === 'string' ? tokenJson.error_description.trim() : '';

    if (errCode === 'invalid_client' || /unknown client|Client authentication failed/i.test(errDesc)) {
      const error =
        errDesc ||
        'GitLab OAuth Client probe: invalid_client — check Application ID and secret on this GitLab base URL';
      noteGitLabProbeFailure({ error, upstreamUrl: tokenUrl });
      return { ok: false, error };
    }

    // Client authenticated; probe code is intentionally invalid.
    if (
      errCode === 'invalid_grant' ||
      errCode === 'invalid_request' ||
      tokenRes.status === 400 ||
      tokenRes.ok
    ) {
      return { ok: true };
    }

    if (!tokenRes.ok) {
      const error = `GitLab OAuth Client probe token HTTP ${tokenRes.status}${errDesc ? `: ${errDesc}` : ''}`;
      noteGitLabProbeFailure({ error, upstreamUrl: tokenUrl });
      return { ok: false, error };
    }
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'GitLab OAuth Client probe failed';
    noteGitLabProbeFailure({ error, upstreamUrl: discoveryUrl });
    return { ok: false, error };
  }
}

export async function probeGitLabReadAccess(opts: {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<ProbeResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = opts.baseUrl.replace(/\/$/, '');
  const token = normalizeGitLabReadToken(opts.token);
  const upstreamUrl = `${base}/api/v4/user`;
  try {
    const res = await fetchImpl(upstreamUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'PRIVATE-TOKEN': token,
      },
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      let detail = '';
      try {
        const parsed = JSON.parse(bodyText) as { message?: unknown };
        if (typeof parsed.message === 'string' && parsed.message.trim()) {
          detail = parsed.message.trim().slice(0, 120);
        }
      } catch {
        if (bodyText.trim()) detail = bodyText.trim().slice(0, 120);
      }
      const hint =
        res.status === 401
          ? ' — use a GitLab Personal/Project Access Token (PRIVATE-TOKEN), not OAuth client secret'
          : '';
      const error = `GitLab Read Access probe HTTP ${res.status}${detail ? `: ${detail}` : ''}${hint}`;
      noteGitLabProbeFailure({ error, upstreamUrl });
      return { ok: false, error };
    }
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'GitLab Read Access probe failed';
    noteGitLabProbeFailure({ error, upstreamUrl });
    return { ok: false, error };
  }
}
