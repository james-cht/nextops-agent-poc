import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyAssistantImagesPayload,
  noticeForImageLoadFailure,
  OPSGPT_CHAT_FOOTER,
  truncationNoticeText,
} from './assistant-chat-view.ts';

describe('applyAssistantImagesPayload', () => {
  it('prefers textSanitized and attaches allowlisted images after text', () => {
    const result = applyAssistantImagesPayload('raw ![x](https://cdn.example.com/a.png)', {
      images: [{ url: 'https://cdn.example.com/a.png' }],
      blocked: [],
      truncated: false,
      textSanitized: 'Clean diagnosis text',
    });
    assert.equal(result.content, 'Clean diagnosis text');
    assert.deepEqual(result.images, [{ url: 'https://cdn.example.com/a.png' }]);
    assert.deepEqual(result.notices, []);
    assert.equal(result.truncated, false);
  });

  it('adds blocked-host notices with hostname only', () => {
    const result = applyAssistantImagesPayload('text', {
      images: [],
      blocked: [{ host: 'evil.example', reason: 'host_not_allowlisted' }],
      truncated: false,
      textSanitized: 'text',
    });
    assert.equal(result.notices.length, 1);
    assert.equal(result.notices[0].kind, 'blocked');
    assert.equal(result.notices[0].host, 'evil.example');
    assert.equal(JSON.stringify(result.notices[0]).includes('http'), false);
  });

  it('keeps truncated flag for UI truncation notice', () => {
    const result = applyAssistantImagesPayload('t', {
      images: [
        { url: 'https://cdn.example.com/1.png' },
        { url: 'https://cdn.example.com/2.png' },
        { url: 'https://cdn.example.com/3.png' },
      ],
      blocked: [],
      truncated: true,
      textSanitized: 't',
    });
    assert.equal(result.truncated, true);
    assert.equal(result.images.length, 3);
  });
});

describe('noticeForImageLoadFailure', () => {
  it('returns load_failed notice with hostname only', () => {
    const notice = noticeForImageLoadFailure('https://cdn.example.com/path/a.png?x=1');
    assert.equal(notice.kind, 'load_failed');
    assert.equal(notice.host, 'cdn.example.com');
  });

  it('returns empty host when URL cannot be parsed', () => {
    const notice = noticeForImageLoadFailure('not-a-url');
    assert.equal(notice.kind, 'load_failed');
    assert.equal(notice.host, '');
  });
});

describe('truncationNoticeText', () => {
  it('returns operator-facing Chinese truncation copy', () => {
    assert.match(truncationNoticeText(), /3/);
  });
});

describe('OPSGPT_CHAT_FOOTER', () => {
  it('does not brand OPSGPT as a Dify product', () => {
    assert.match(OPSGPT_CHAT_FOOTER, /LangGraph/i);
    assert.doesNotMatch(OPSGPT_CHAT_FOOTER, /dify/i);
  });
});
