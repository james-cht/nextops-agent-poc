import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  gitlabOAuthRedirectUri,
  mergeGitLabOAuthClientPatch,
  mergeGitLabReadAccessPatch,
  normalizePublicOrigin,
  type GitLabOAuthClientValues,
  type GitLabReadAccessValues,
} from './gitlab-settings-policy.ts';

describe('GitLab settings policy', () => {
  it('derives OAuth redirect URI from the NextOps public origin — not a Runtime Setting field', () => {
    assert.equal(
      gitlabOAuthRedirectUri('https://nextops.example'),
      'https://nextops.example/api/auth/gitlab/callback',
    );
    assert.equal(
      gitlabOAuthRedirectUri('https://nextops.example/'),
      'https://nextops.example/api/auth/gitlab/callback',
    );
  });

  it('puts the GitLab OAuth redirect under Public Base Path on a shared host', () => {
    assert.equal(
      gitlabOAuthRedirectUri('https://tmdev.corp.example.com', '/nextops'),
      'https://tmdev.corp.example.com/nextops/api/auth/gitlab/callback',
    );
  });

  it('strips quotes and whitespace from ORIGIN before building redirect URI', () => {
    assert.equal(normalizePublicOrigin('  "http://192.0.2.2:3003"  '), 'http://192.0.2.2:3003');
    assert.equal(normalizePublicOrigin("'https://nextops.example/'"), 'https://nextops.example');
    assert.equal(
      gitlabOAuthRedirectUri('"http://192.0.2.2:3003"'),
      'http://192.0.2.2:3003/api/auth/gitlab/callback',
    );
  });

  it('leaves OAuth client secret unchanged when the patch secret is empty', () => {
    const current: GitLabOAuthClientValues = {
      baseUrl: 'https://gitlab.example',
      clientId: 'id-1',
      clientSecret: 'secret-keep',
    };
    const merged = mergeGitLabOAuthClientPatch(current, {
      baseUrl: 'https://gitlab.new',
      clientId: 'id-2',
      clientSecret: '   ',
    });
    assert.deepEqual(merged, {
      baseUrl: 'https://gitlab.new',
      clientId: 'id-2',
      clientSecret: 'secret-keep',
    });
  });

  it('leaves Read Access token unchanged when the patch token is empty', () => {
    const current: GitLabReadAccessValues = { token: 'glpat-keep' };
    const merged = mergeGitLabReadAccessPatch(current, { token: '' });
    assert.deepEqual(merged, { token: 'glpat-keep' });
  });
});
