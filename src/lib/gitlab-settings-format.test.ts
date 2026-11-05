import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toGitLabSettingsAdminPayload } from './gitlab-settings-format.ts';

describe('toGitLabSettingsAdminPayload', () => {
  it('masks secrets and exposes derived redirect URI', () => {
    const payload = toGitLabSettingsAdminPayload({
      oauth: {
        baseUrl: 'https://gitlab.example',
        clientId: 'cid',
        clientSecret: 'super-secret-value',
      },
      readAccess: { token: 'glpat-abcdefghijklmnop' },
      publicOrigin: 'https://nextops.example',
    });
    assert.equal(payload.oauth.clientSecretSet, true);
    assert.ok(payload.oauth.clientSecretMasked.includes('••••'));
    assert.equal(payload.readAccess.tokenSet, true);
    assert.ok(!payload.readAccess.tokenMasked.includes('glpat-abcdefghijklmnop'));
    assert.equal(
      payload.oauthRedirectUri,
      'https://nextops.example/api/auth/gitlab/callback',
    );
  });

  it('puts oauthRedirectUri under Public Base Path on a shared host', () => {
    const payload = toGitLabSettingsAdminPayload({
      oauth: null,
      readAccess: null,
      publicOrigin: 'https://tmdev.corp.example.com',
      publicBasePath: '/nextops',
    });
    assert.equal(
      payload.oauthRedirectUri,
      'https://tmdev.corp.example.com/nextops/api/auth/gitlab/callback',
    );
  });
});
