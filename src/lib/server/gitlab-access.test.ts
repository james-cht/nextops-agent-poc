import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildGitLabAuthorizeUrl,
  exchangeGitLabAuthorizationCode,
  isGitLabAccessValid,
  type GitLabAccessRecord,
} from './gitlab-access.ts';

describe('GitLab Access helpers', () => {
  it('treats missing or expired Access as invalid without touching Session', () => {
    assert.equal(isGitLabAccessValid(null, new Date('2026-01-01T00:00:00Z')), false);
    const expired: GitLabAccessRecord = {
      username: 'changsan',
      accessToken: 't',
      refreshToken: null,
      expiresAt: '2025-12-31T00:00:00Z',
      updatedAt: '2025-12-01T00:00:00Z',
    };
    assert.equal(isGitLabAccessValid(expired, new Date('2026-01-01T00:00:00Z')), false);
    const live: GitLabAccessRecord = {
      ...expired,
      expiresAt: '2026-06-01T00:00:00Z',
    };
    assert.equal(isGitLabAccessValid(live, new Date('2026-01-01T00:00:00Z')), true);
    const noExpiry: GitLabAccessRecord = {
      ...expired,
      expiresAt: null,
    };
    assert.equal(isGitLabAccessValid(noExpiry, new Date('2026-01-01T00:00:00Z')), true);
  });

  it('builds the GitLab authorize URL with state and redirect URI', () => {
    const url = buildGitLabAuthorizeUrl({
      baseUrl: 'https://gitlab.example/',
      clientId: 'cid',
      redirectUri: 'https://nextops.example/api/auth/gitlab/callback',
      state: 'abc',
    });
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://gitlab.example');
    assert.equal(parsed.pathname, '/oauth/authorize');
    assert.equal(parsed.searchParams.get('client_id'), 'cid');
    assert.equal(parsed.searchParams.get('response_type'), 'code');
    assert.equal(parsed.searchParams.get('state'), 'abc');
    assert.equal(
      parsed.searchParams.get('redirect_uri'),
      'https://nextops.example/api/auth/gitlab/callback',
    );
    assert.ok((parsed.searchParams.get('scope') ?? '').includes('api'));
  });

  it('exchanges an authorization code via an injected fetch port', async () => {
    const result = await exchangeGitLabAuthorizationCode({
      baseUrl: 'https://gitlab.example',
      clientId: 'cid',
      clientSecret: 'sec',
      code: 'the-code',
      redirectUri: 'https://nextops.example/api/auth/gitlab/callback',
      fetchImpl: async (input, init) => {
        assert.equal(String(input), 'https://gitlab.example/oauth/token');
        assert.equal(init?.method, 'POST');
        return new Response(
          JSON.stringify({
            access_token: 'tok',
            refresh_token: 'ref',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
      now: new Date('2026-01-01T00:00:00Z'),
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.accessToken, 'tok');
      assert.equal(result.refreshToken, 'ref');
      assert.equal(result.expiresAt, '2026-01-01T01:00:00.000Z');
    }
  });
});
