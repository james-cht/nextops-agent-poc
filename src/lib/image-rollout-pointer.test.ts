import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseImageRolloutPointer,
  recordImageRollout,
  rollbackImageRollout,
  serializeImageRolloutPointer,
} from './image-rollout-pointer.ts';

describe('image rollout pointer', () => {
  it('keeps the previous image tag when a new tag is recorded', () => {
    const first = recordImageRollout(null, 'aaa111aaa111');
    assert.deepEqual(first, { current: 'aaa111aaa111', previous: null });
    const second = recordImageRollout(first, 'bbb222bbb222');
    assert.deepEqual(second, { current: 'bbb222bbb222', previous: 'aaa111aaa111' });
    const same = recordImageRollout(second, 'bbb222bbb222');
    assert.deepEqual(same, second);
  });

  it('rolls current back to previous and refuses when there is no previous', () => {
    const rolled = rollbackImageRollout({ current: 'bbb222bbb222', previous: 'aaa111aaa111' });
    assert.equal(rolled.ok, true);
    if (rolled.ok) {
      assert.deepEqual(rolled.pointer, { current: 'aaa111aaa111', previous: 'bbb222bbb222' });
    }
    const none = rollbackImageRollout({ current: 'aaa111aaa111', previous: null });
    assert.equal(none.ok, false);
  });

  it('parses a pointer file and rejects missing current IMAGE_TAG', () => {
    assert.equal(parseImageRolloutPointer(null), null);
    assert.equal(parseImageRolloutPointer('null'), null);
    assert.deepEqual(parseImageRolloutPointer('{"current":"bbb222bbb222","previous":"aaa111aaa111"}'), {
      current: 'bbb222bbb222',
      previous: 'aaa111aaa111',
    });
    assert.equal(parseImageRolloutPointer('{"previous":"aaa111aaa111"}'), null);
    assert.equal(parseImageRolloutPointer('{'), null);
    const roundTrip = parseImageRolloutPointer(
      serializeImageRolloutPointer({ current: 'bbb222bbb222', previous: 'aaa111aaa111' }),
    );
    assert.deepEqual(roundTrip, { current: 'bbb222bbb222', previous: 'aaa111aaa111' });
  });
});
