import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mainSidebarNavItems } from './main-sidebar-nav.ts';

describe('main sidebar nav', () => {
  it('lists ops items including 運維點檢, then 應用目錄 and 應用上線', () => {
    const items = mainSidebarNavItems();
    assert.deepEqual(
      items.map((i) => i.path),
      ['/', '/ai', '/logs', '/alerts', '/robusta', '/ops-check', '/applications', '/online'],
    );
    assert.equal(items.find((i) => i.path === '/ops-check')?.label, '運維點檢');
    assert.equal(items.find((i) => i.path === '/applications')?.label, '應用目錄');
    assert.equal(items.at(-1)?.label, '應用上線');
  });
});
