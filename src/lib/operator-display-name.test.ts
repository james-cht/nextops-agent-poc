import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chatRoomVisibleTitle,
  normalizeOperatorDisplayName,
  operatorVisibleName,
  type NormalizeOperatorDisplayNameResult,
} from './operator-display-name.ts';

describe('Operator Display Name', () => {
  it('requires a trimmed 1–64 character name and rejects OPSGPT', () => {
    assert.deepEqual(normalizeOperatorDisplayName('  王小明  '), { ok: true, value: '王小明' });
    assert.deepEqual(normalizeOperatorDisplayName('a'.repeat(64)), {
      ok: true,
      value: 'a'.repeat(64),
    });

    const empty = normalizeOperatorDisplayName('   ') as Extract<
      NormalizeOperatorDisplayNameResult,
      { ok: false }
    >;
    assert.equal(empty.ok, false);
    assert.match(empty.error, /required/i);

    const tooLong = normalizeOperatorDisplayName('a'.repeat(65));
    assert.equal(tooLong.ok, false);

    const reserved = normalizeOperatorDisplayName('opsgpt');
    assert.equal(reserved.ok, false);
  });

  it('uses Operator Display Name for labels and falls back to Username', () => {
    assert.equal(operatorVisibleName({ displayName: '王小明', username: 'mc00146' }), '王小明');
    assert.equal(operatorVisibleName({ displayName: null, username: 'mc00146' }), 'mc00146');
    assert.equal(operatorVisibleName({ displayName: '  ', username: 'mc00146' }), 'mc00146');
  });

  it('relabels Operator DM room titles from Username to Operator Display Name', () => {
    assert.equal(
      chatRoomVisibleTitle({
        kind: 'operator_dm',
        title: 'bob',
        accounts: [{ username: 'bob', displayName: '鮑伯' }],
      }),
      '鮑伯',
    );
    assert.equal(
      chatRoomVisibleTitle({
        kind: 'public',
        title: '公共',
        accounts: [],
      }),
      '公共',
    );
  });
});
