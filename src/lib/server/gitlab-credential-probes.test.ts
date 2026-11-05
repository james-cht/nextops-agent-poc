import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeGitLabReadToken,
  probeGitLabOAuthBase,
  probeGitLabReadAccess,
} from './gitlab-credential-probes.ts';

describe('probeGitLabOAuthBase', () => {
  it('succeeds when discovery works and token endpoint accepts the client (invalid_grant)', async () => {
    const called: string[] = [];
    const result = await probeGitLabOAuthBase({
      baseUrl: 'https://gitlab.example/',
      clientId: 'cid',
      clientSecret: 'sec',
      redirectUri: 'https://nextops.example/api/auth/gitlab/callback',
      fetchImpl: async (url, init) => {
        called.push(`${init?.method ?? 'GET'} ${String(url)}`);
        if (String(url).endsWith('/.well-known/openid-configuration')) {
          return new Response(
            JSON.stringify({
              issuer: 'https://gitlab.example',
              authorization_endpoint: 'https://gitlab.example/oauth/authorize',
              token_endpoint: 'https://gitlab.example/oauth/token',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (String(url).endsWith('/oauth/token')) {
          const body = String(init?.body ?? '');
          assert.match(body, /client_id=cid/);
          assert.match(body, /client_secret=sec/);
          return new Response(
            JSON.stringify({
              error: 'invalid_grant',
              error_description: 'The provided authorization grant is invalid',
            }),
            { status: 400, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response('no', { status: 404 });
      },
    });
    assert.equal(result.ok, true);
    assert.ok(called.some((c) => c.includes('/oauth/token')));
  });

  it('fails when GitLab reports unknown / unauthenticated client', async () => {
    const result = await probeGitLabOAuthBase({
      baseUrl: 'https://gitlab.example',
      clientId: 'wrong',
      clientSecret: 'sec',
      redirectUri: 'https://nextops.example/api/auth/gitlab/callback',
      fetchImpl: async (url) => {
        if (String(url).endsWith('/.well-known/openid-configuration')) {
          return new Response(
            JSON.stringify({
              issuer: 'https://gitlab.example',
              authorization_endpoint: 'https://gitlab.example/oauth/authorize',
              token_endpoint: 'https://gitlab.example/oauth/token',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            error: 'invalid_client',
            error_description:
              'Client authentication failed due to unknown client, no client authentication included, or unsupported authentication method.',
          }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /unknown client|invalid_client|Client authentication failed/i);
    }
  });

  it('fails when OpenID discovery is not a GitLab OAuth issuer', async () => {
    const result = await probeGitLabOAuthBase({
      baseUrl: 'https://gitlab.example',
      fetchImpl: async () => new Response('{"message":"401 Unauthorized"}', { status: 401 }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /GitLab OAuth Client probe/i);
  });
});

describe('probeGitLabReadAccess', () => {
  it('strips accidental Bearer prefix and fails on HTTP 401 from /api/v4/user', async () => {
    assert.equal(normalizeGitLabReadToken('Bearer glpat-x'), 'glpat-x');
    assert.equal(normalizeGitLabReadToken('  glpat-y  '), 'glpat-y');

    const result = await probeGitLabReadAccess({
      baseUrl: 'https://gitlab.example',
      token: 'Bearer glpat-bad',
      fetchImpl: async (url, init) => {
        assert.equal(String(url), 'https://gitlab.example/api/v4/user');
        assert.equal((init?.headers as Record<string, string>)['PRIVATE-TOKEN'], 'glpat-bad');
        return new Response(JSON.stringify({ message: '401 Unauthorized' }), { status: 401 });
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /GitLab Read Access probe HTTP 401/);
      assert.match(result.error, /401 Unauthorized|PRIVATE-TOKEN|Personal Access Token/i);
    }
  });
});
