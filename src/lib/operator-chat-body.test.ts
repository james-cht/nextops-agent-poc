import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chatBodyNodes, parsePublicOpsgptInvoke } from './operator-chat-body.ts';

describe('chatBodyNodes', () => {
  it('keeps plain text as a single node', () => {
    assert.deepEqual(chatBodyNodes('龍華 CPU'), [{ type: 'text', value: '龍華 CPU' }]);
  });

  it('autolinks http(s) URLs and same-origin paths', () => {
    const nodes = chatBodyNodes('see https://example.com/a and /alerts please');
    assert.deepEqual(nodes, [
      { type: 'text', value: 'see ' },
      { type: 'link', value: 'https://example.com/a' },
      { type: 'text', value: ' and ' },
      { type: 'link', value: '/alerts' },
      { type: 'text', value: ' please' },
    ]);
  });

  it('does not treat slash inside a word as a path link', () => {
    assert.deepEqual(chatBodyNodes('k8s/pod'), [{ type: 'text', value: 'k8s/pod' }]);
  });
});

describe('parsePublicOpsgptInvoke', () => {
  it('treats a case-insensitive @OPSGPT prefix as one invoke', () => {
    const parsed = parsePublicOpsgptInvoke('@opsgpt 龍華 CPU');
    assert.equal(parsed.invoke, true);
    assert.equal(parsed.query, '龍華 CPU');
  });

  it('does not invoke on a mid-body mention', () => {
    assert.equal(parsePublicOpsgptInvoke('ask @OPSGPT later').invoke, false);
  });

  it('invokes from a mention chip even without a prefix', () => {
    const parsed = parsePublicOpsgptInvoke('龍華 CPU', true);
    assert.equal(parsed.invoke, true);
    assert.equal(parsed.query, '龍華 CPU');
  });
});
