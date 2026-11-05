import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { upsertDotEnvAssignment } from './image-rollout-env.ts';

describe('upsertDotEnvAssignment', () => {
  it('pins IMAGE_TAG without dropping other runtime secrets', () => {
    const next = upsertDotEnvAssignment('ORIGIN=http://192.0.2.2:3003\nPORT=3003\n', 'IMAGE_TAG', 'bbb222bbb222');
    assert.match(next, /^ORIGIN=http:\/\/10\.57\.221\.94:3003$/m);
    assert.match(next, /^PORT=3003$/m);
    assert.match(next, /^IMAGE_TAG=bbb222bbb222$/m);
  });

  it('replaces every existing IMAGE_TAG assignment', () => {
    const next = upsertDotEnvAssignment('IMAGE_TAG=old\nPORT=3003\nIMAGE_TAG=stale\n', 'IMAGE_TAG', 'aaa111aaa111');
    assert.equal([...next.matchAll(/^IMAGE_TAG=/gm)].length, 2);
    assert.equal((next.match(/^IMAGE_TAG=aaa111aaa111$/gm) ?? []).length, 2);
    assert.doesNotMatch(next, /IMAGE_TAG=old/);
  });
});
