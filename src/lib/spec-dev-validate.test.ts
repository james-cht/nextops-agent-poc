import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDevValidateEnqueue,
  canTriggerDevValidate,
} from './spec-dev-validate.ts';

describe('Service Deploy Spec — 在 Dev 驗證', () => {
  it('lets Developer trigger only membership Projects; Operator all; Viewer never', () => {
    assert.equal(
      canTriggerDevValidate({
        role: 'application_developer',
        username: 'lin.dev',
        nameSpace: 'efactory',
        memberships: [{ nameSpace: 'efactory', username: 'lin.dev' }],
      }),
      true,
    );
    assert.equal(
      canTriggerDevValidate({
        role: 'application_developer',
        username: 'lin.dev',
        nameSpace: 'other',
        memberships: [{ nameSpace: 'efactory', username: 'lin.dev' }],
      }),
      false,
    );
    assert.equal(
      canTriggerDevValidate({
        role: 'operator',
        username: 'ops',
        nameSpace: 'efactory',
        memberships: [],
      }),
      true,
    );
    assert.equal(
      canTriggerDevValidate({
        role: 'viewer',
        username: 'watch',
        nameSpace: 'efactory',
        memberships: [],
      }),
      false,
    );
  });

  it('enqueues with pinned published SHA and Spec defaultRef, never an unmerged draft', () => {
    const ok = buildDevValidateEnqueue({
      jobId: 'job-efactory-ap-dev',
      publishedPinSha: 'abcmerged',
      defaultRef: 'main',
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.request.pinnedSha, 'abcmerged');
      assert.equal(ok.request.defaultRef, 'main');
      assert.equal(ok.request.jobId, 'job-efactory-ap-dev');
      assert.equal(Object.hasOwn(ok.request, 'draftSha'), false);
    }

    const denied = buildDevValidateEnqueue({
      jobId: 'job-efactory-ap-dev',
      publishedPinSha: null,
      defaultRef: 'main',
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.match(denied.error, /pinned|published/i);
  });
});
