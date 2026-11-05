import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateImageUrl,
  extractImageUrlsFromAnswer,
  parseImageAllowlist,
  resolveAssistantImages,
} from './assistant-images.ts';

describe('parseImageAllowlist', () => {
  it('splits comma-separated hostnames and trims blanks', () => {
    assert.deepEqual(parseImageAllowlist('cdn.example.com,  img.ops.local,,'), [
      'cdn.example.com',
      'img.ops.local',
    ]);
  });

  it('returns empty list for undefined or blank input', () => {
    assert.deepEqual(parseImageAllowlist(undefined), []);
    assert.deepEqual(parseImageAllowlist('  '), []);
  });
});

describe('evaluateImageUrl', () => {
  const allowlist = new Set(['cdn.example.com', 'aiot-dev.corp.example.com']);

  it('accepts https URL whose host is on the Image Allowlist', () => {
    const result = evaluateImageUrl(
      'https://cdn.example.com/charts/cpu.png',
      allowlist,
    );
    assert.equal(result.status, 'accepted');
    if (result.status === 'accepted') {
      assert.equal(result.url, 'https://cdn.example.com/charts/cpu.png');
    }
  });

  it('blocks non-allowlisted host and exposes hostname only', () => {
    const result = evaluateImageUrl(
      'https://evil.example/track.png?token=secret',
      allowlist,
    );
    assert.equal(result.status, 'blocked');
    if (result.status === 'blocked') {
      assert.equal(result.host, 'evil.example');
      assert.equal(result.reason, 'host_not_allowlisted');
      assert.equal('url' in result, false);
    }
  });

  it('blocks http URLs even when host is allowlisted', () => {
    const result = evaluateImageUrl('http://cdn.example.com/x.png', allowlist);
    assert.equal(result.status, 'blocked');
    if (result.status === 'blocked') {
      assert.equal(result.host, 'cdn.example.com');
      assert.equal(result.reason, 'insecure_scheme');
    }
  });

  it('blocks unparseable URLs without leaking a full url field', () => {
    const result = evaluateImageUrl('not-a-url', allowlist);
    assert.equal(result.status, 'blocked');
    if (result.status === 'blocked') {
      assert.equal(result.reason, 'invalid_url');
      assert.ok(result.host === '' || typeof result.host === 'string');
    }
  });
});

describe('extractImageUrlsFromAnswer', () => {
  it('extracts URLs from a fenced media JSON block and strips the fence from text', () => {
    const answer =
      'Diagnosis complete.\n\n```media\n{"images":[{"url":"https://cdn.example.com/a.png"}]}\n```\n\nSee chart.';
    const result = extractImageUrlsFromAnswer(answer);
    assert.deepEqual(result.urls, ['https://cdn.example.com/a.png']);
    assert.match(result.text, /Diagnosis complete/);
    assert.match(result.text, /See chart/);
    assert.equal(result.text.includes('```media'), false);
    assert.equal(result.text.includes('cdn.example.com/a.png'), false);
  });

  it('extracts markdown image URLs and strips the markdown from text', () => {
    const answer = 'Trend:\n![CPU](https://cdn.example.com/cpu.png)\nDone.';
    const result = extractImageUrlsFromAnswer(answer);
    assert.deepEqual(result.urls, ['https://cdn.example.com/cpu.png']);
    assert.equal(result.text.includes('![CPU]'), false);
    assert.equal(result.text.includes('https://cdn.example.com/cpu.png'), false);
    assert.match(result.text, /Trend/);
    assert.match(result.text, /Done/);
  });

  it('merges media block and markdown sources and dedupes identical URLs', () => {
    const url = 'https://cdn.example.com/same.png';
    const answer =
      `Intro\n![x](${url})\n\`\`\`media\n{"images":[{"url":"${url}"},{"url":"https://cdn.example.com/other.png"}]}\n\`\`\``;
    const result = extractImageUrlsFromAnswer(answer);
    assert.deepEqual(result.urls, [
      'https://cdn.example.com/same.png',
      'https://cdn.example.com/other.png',
    ]);
  });
});

describe('resolveAssistantImages', () => {
  const allowlist = new Set(['cdn.example.com']);

  it('combines native URLs with answer extraction and evaluates allowlist', () => {
    const result = resolveAssistantImages({
      answerText: 'Note\n![ok](https://cdn.example.com/from-md.png)\n',
      nativeUrls: ['https://cdn.example.com/native.png', 'https://evil.example/x.png'],
      allowlist,
    });
    assert.deepEqual(
      result.images.map((i) => i.url),
      ['https://cdn.example.com/native.png', 'https://cdn.example.com/from-md.png'],
    );
    assert.equal(result.blocked.length, 1);
    assert.equal(result.blocked[0].host, 'evil.example');
    assert.equal(result.text.includes('![ok]'), false);
    assert.equal(result.truncated, false);
  });

  it('keeps at most three accepted images and sets truncated when more exist', () => {
    const result = resolveAssistantImages({
      answerText: '',
      nativeUrls: [
        'https://cdn.example.com/1.png',
        'https://cdn.example.com/2.png',
        'https://cdn.example.com/3.png',
        'https://cdn.example.com/4.png',
        'https://evil.example/skip.png',
      ],
      allowlist,
    });
    assert.deepEqual(
      result.images.map((i) => i.url),
      [
        'https://cdn.example.com/1.png',
        'https://cdn.example.com/2.png',
        'https://cdn.example.com/3.png',
      ],
    );
    assert.equal(result.truncated, true);
    assert.equal(result.blocked.length, 1);
    assert.equal(result.blocked[0].host, 'evil.example');
  });

  it('does not set truncated when three or fewer accepted images', () => {
    const result = resolveAssistantImages({
      answerText: '',
      nativeUrls: [
        'https://cdn.example.com/1.png',
        'https://cdn.example.com/2.png',
        'https://cdn.example.com/3.png',
      ],
      allowlist,
    });
    assert.equal(result.images.length, 3);
    assert.equal(result.truncated, false);
  });
});
