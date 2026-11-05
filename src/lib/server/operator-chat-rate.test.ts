import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { consumeChatAiTurn, consumeHumanChatRate, releaseChatAiTurn, _resetHumanChatRateForTests } from './operator-chat-rate.ts';

afterEach(() => {
  _resetHumanChatRateForTests();
});

describe('Operator Chat human rate limit', () => {
  it('allows 20 sends in a minute then rejects the 21st', () => {
    const t0 = Date.parse('2026-09-03T12:00:00.000Z');
    for (let i = 0; i < 20; i++) {
      assert.equal(consumeHumanChatRate('ops', t0 + i * 100), true);
    }
    assert.equal(consumeHumanChatRate('ops', t0 + 2100), false);
    assert.equal(consumeHumanChatRate('other', t0 + 2100), true);
  });

  it('allows another send after the window slides', () => {
    const t0 = Date.parse('2026-09-03T12:00:00.000Z');
    for (let i = 0; i < 20; i++) {
      assert.equal(consumeHumanChatRate('ops', t0), true);
    }
    assert.equal(consumeHumanChatRate('ops', t0 + 60_000), true);
  });
});

describe('Operator Chat AI rate', () => {
  it('rejects a second in-flight turn then allows after release', () => {
    const t0 = Date.parse('2026-09-03T12:00:00.000Z');
    assert.equal(consumeChatAiTurn('ops', t0).ok, true);
    const pending = consumeChatAiTurn('ops', t0 + 1000);
    assert.equal(pending.ok, false);
    if (pending.ok) return;
    assert.equal(pending.code, 'PENDING');
    releaseChatAiTurn('ops');
    assert.equal(consumeChatAiTurn('ops', t0 + 2000).ok, true);
  });

  it('allows 10 turns in an hour then rejects the 11th', () => {
    const t0 = Date.parse('2026-09-03T12:00:00.000Z');
    for (let i = 0; i < 10; i++) {
      const r = consumeChatAiTurn('ops', t0 + i * 1000);
      assert.equal(r.ok, true);
      releaseChatAiTurn('ops');
    }
    const blocked = consumeChatAiTurn('ops', t0 + 11_000);
    assert.equal(blocked.ok, false);
    if (blocked.ok) return;
    assert.equal(blocked.code, 'RATE_LIMITED');
  });
});
