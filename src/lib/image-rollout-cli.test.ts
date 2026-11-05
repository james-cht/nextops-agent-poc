import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runImageRolloutCommand } from './image-rollout-cli.ts';

const POINTER = JSON.stringify({ current: 'bbb222bbb222', previous: 'aaa111aaa111' });

describe('image rollout CLI', () => {
  it('show prints current and previous IMAGE_TAG lines', () => {
    const result = runImageRolloutCommand(['show', POINTER]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, 'current=bbb222bbb222\nprevious=aaa111aaa111\n');
    assert.equal(result.stderr, '');
  });

  it('show with null pointer prints empty current and previous', () => {
    const result = runImageRolloutCommand(['show', 'null']);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, 'current=\nprevious=\n');
  });

  it('previous prints the previous IMAGE_TAG', () => {
    const result = runImageRolloutCommand(['previous', POINTER]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, 'aaa111aaa111');
  });

  it('current prints the current IMAGE_TAG', () => {
    const result = runImageRolloutCommand(['current', POINTER]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, 'bbb222bbb222');
  });

  it('record keeps previous IMAGE_TAG when a new tag is published', () => {
    const result = runImageRolloutCommand(['record', POINTER, 'ccc333ccc333']);
    assert.equal(result.exitCode, 0);
    assert.equal(
      result.stdout,
      JSON.stringify({ current: 'ccc333ccc333', previous: 'bbb222bbb222' }) + '\n',
    );
  });

  it('rollback swaps current with previous IMAGE_TAG', () => {
    const result = runImageRolloutCommand(['rollback', POINTER]);
    assert.equal(result.exitCode, 0);
    assert.equal(
      result.stdout,
      JSON.stringify({ current: 'aaa111aaa111', previous: 'bbb222bbb222' }) + '\n',
    );
  });

  it('pin-env writes IMAGE_TAG without dropping other runtime secrets', () => {
    const result = runImageRolloutCommand(
      ['pin-env', 'IMAGE_TAG', 'aaa111aaa111'],
      'ORIGIN=http://192.0.2.2:3003\nPORT=3003\n',
    );
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^ORIGIN=http:\/\/10\.57\.221\.94:3003$/m);
    assert.match(result.stdout, /^PORT=3003$/m);
    assert.match(result.stdout, /^IMAGE_TAG=aaa111aaa111$/m);
  });

  it('rejects invalid pointer for current and rollback', () => {
    const badCurrent = runImageRolloutCommand(['current', '{']);
    assert.equal(badCurrent.exitCode, 2);
    assert.match(badCurrent.stderr, /Invalid image rollout pointer/);

    const noPrev = runImageRolloutCommand([
      'rollback',
      JSON.stringify({ current: 'aaa111aaa111', previous: null }),
    ]);
    assert.equal(noPrev.exitCode, 2);
    assert.match(noPrev.stderr, /No previous image tag/);
  });
});
