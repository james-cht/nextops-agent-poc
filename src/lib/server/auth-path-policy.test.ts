import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isHealthPath, isSessionExemptPath, sessionLoginLocation } from './auth-path-policy.ts';

describe('auth path session policy', () => {
  it('exempts login/logout and GitLab callback, but not GitLab authorize', () => {
    assert.equal(isSessionExemptPath('/login'), true);
    assert.equal(isSessionExemptPath('/api/auth/login'), true);
    assert.equal(isSessionExemptPath('/api/auth/logout'), true);
    assert.equal(isSessionExemptPath('/api/auth/gitlab/callback'), true);
    // Authorize must see Session — otherwise Connect GitLab returns Session required.
    assert.equal(isSessionExemptPath('/api/auth/gitlab/authorize'), false);
    assert.equal(isSessionExemptPath('/api/account/me'), false);
    assert.equal(isSessionExemptPath('/admin/account/me'), false);
  });

  it('treats login and GitLab callback under Public Base Path as the same Session-exempt routes', () => {
    assert.equal(isSessionExemptPath('/nextops/login', '/nextops'), true);
    assert.equal(isSessionExemptPath('/nextops/api/auth/login', '/nextops'), true);
    assert.equal(isSessionExemptPath('/nextops/api/auth/gitlab/callback', '/nextops'), true);
    assert.equal(isSessionExemptPath('/nextops/api/auth/gitlab/authorize', '/nextops'), false);
    assert.equal(isSessionExemptPath('/nextops/', '/nextops'), false);
  });

  it('sends missing-Session operators to login under the Public Base Path', () => {
    assert.equal(sessionLoginLocation(''), '/login');
    assert.equal(sessionLoginLocation('/nextops'), '/nextops/login');
  });

  it('recognizes health under Public Base Path so probes skip Session', () => {
    assert.equal(isHealthPath('/api/health'), true);
    assert.equal(isHealthPath('/nextops/api/health', '/nextops'), true);
    assert.equal(isHealthPath('/nextops/login', '/nextops'), false);
  });
});
