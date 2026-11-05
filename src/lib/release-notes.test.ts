import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RELEASE_CATALOG,
  compileReleaseCatalog,
  compareReleaseVersion,
  getReleaseCatalog,
  isSameOriginPath,
  parseReleaseMarkup,
  parseReleaseVersion,
  releaseNotesUnread,
  type ReleaseRecord,
} from './release-notes.ts';

describe('Release Version', () => {
  it('parses MAJOR.MINOR.PATCH only', () => {
    assert.deepEqual(parseReleaseVersion('1.0.0'), [1, 0, 0]);
    assert.equal(parseReleaseVersion('1.0'), null);
    assert.equal(parseReleaseVersion('v1.0.0'), null);
  });

  it('orders versions by operator-facing semver', () => {
    assert.ok(compareReleaseVersion('1.1.0', '1.0.9') > 0);
    assert.ok(compareReleaseVersion('2.0.0', '1.9.9') > 0);
    assert.equal(compareReleaseVersion('1.0.0', '1.0.0'), 0);
  });

  it('treats missing Last-Read as unread for a valid running Version', () => {
    assert.equal(releaseNotesUnread('1.0.0', null), true);
    assert.equal(releaseNotesUnread('1.0.0', ''), true);
    assert.equal(releaseNotesUnread('1.0.0', '1.0.0'), false);
    assert.equal(releaseNotesUnread('1.1.0', '1.0.0'), true);
    assert.equal(releaseNotesUnread('1.0.0', '1.1.0'), false);
  });
});

describe('Release catalog', () => {
  it('ships 1.4.0 as the running Version and keeps frozen 1.3.2 / 1.3.1 / 1.3.0 / 1.2.0 / 1.1.0 / 1.0.0 Notes', () => {
    const catalog = getReleaseCatalog();
    assert.equal(catalog.runningVersion, '1.4.0');
    assert.equal(RELEASE_CATALOG.releases[0].version, '1.4.0');
    const runningIds = catalog.releases[0].notes.map((n) => n.id);
    assert.ok(runningIds.includes('1.4.0-live-pod-diagnostics-reading'));
    assert.equal(catalog.releases[1].version, '1.3.2');
    assert.ok(catalog.releases[1].notes.some((n) => n.id === '1.3.2-admin-gear-redirect'));
    assert.equal(catalog.releases[2].version, '1.3.1');
    assert.ok(catalog.releases[2].notes.some((n) => n.id === '1.3.1-public-base-path-navigation'));
    assert.equal(catalog.releases[3].version, '1.3.0');
    const priorIds = catalog.releases[3].notes.map((n) => n.id);
    assert.ok(priorIds.includes('1.3.0-application-catalog'));
    assert.ok(priorIds.includes('1.3.0-gitlab-access'));
    assert.ok(priorIds.includes('1.3.0-image-rollback'));
    assert.equal(catalog.releases[4].version, '1.2.0');
    assert.equal(catalog.releases[5].version, '1.1.0');
    assert.equal(catalog.releases[6].version, '1.0.0');
    assert.ok(catalog.releases[6].notes.some((n) => n.id === '1.0.0-release-notes'));
  });

  it('lists Releases newest first and rejects an empty Release', () => {
    const compiled = compileReleaseCatalog([
      {
        version: '1.0.0',
        notes: [{ id: 'a', title: 'A', summary: 'sa', detail: 'da' }],
      },
      {
        version: '1.1.0',
        notes: [{ id: 'b', title: 'B', summary: 'sb', detail: 'db' }],
      },
    ]);
    assert.equal(compiled.runningVersion, '1.1.0');
    assert.deepEqual(
      compiled.releases.map((r) => r.version),
      ['1.1.0', '1.0.0'],
    );
    assert.throws(() => compileReleaseCatalog([]));
    assert.throws(() =>
      compileReleaseCatalog([
        { version: '1.0.0', notes: [] } satisfies ReleaseRecord,
      ]),
    );
  });
});

describe('Release Note constrained markup', () => {
  it('parses paragraphs, lists, and same-origin path links', () => {
    const blocks = parseReleaseMarkup(
      '先看 [告警中心](/alerts)。\n\n- 打開 [智能日誌](/logs)\n- 第二步',
    );
    assert.deepEqual(blocks, [
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: '先看 ' },
          { type: 'link', href: '/alerts', label: '告警中心' },
          { type: 'text', value: '。' },
        ],
      },
      {
        type: 'list',
        items: [
          [
            { type: 'text', value: '打開 ' },
            { type: 'link', href: '/logs', label: '智能日誌' },
          ],
          [{ type: 'text', value: '第二步' }],
        ],
      },
    ]);
  });

  it('keeps outbound and javascript targets as literal text', () => {
    assert.equal(isSameOriginPath('/alerts'), true);
    assert.equal(isSameOriginPath('https://example.com'), false);
    assert.equal(isSameOriginPath('javascript:alert(1)'), false);
    assert.equal(isSameOriginPath('//evil.example'), false);
    const blocks = parseReleaseMarkup('見 [x](https://example.com) 與 [y](javascript:alert(1))');
    const inlines = blocks[0]?.type === 'paragraph' ? blocks[0].children : [];
    assert.equal(inlines.some((n) => n.type === 'link'), false);
    assert.ok(inlines.some((n) => n.type === 'text' && n.value.includes('https://example.com')));
  });
});
