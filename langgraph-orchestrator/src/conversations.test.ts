import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openConversationStore, summarizeTurns } from './conversations.ts';

function tempDbPath(): string {
  return path.join(process.cwd(), '.tmp-tests', `conv-${Date.now()}-${Math.random()}.sqlite`);
}

test('conversation store put/get and prune', () => {
  const dbPath = tempDbPath();
  const store = openConversationStore(dbPath);
  store.put({
    id: 'c1',
    siteId: 'S1',
    summary: 'x',
    turns: [{ role: 'user', content: 'u' }, { role: 'assistant', content: 'a' }],
    updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
  });
  assert.equal(store.get('c1')?.siteId, 'S1');
  store.prune(new Date());
  assert.equal(store.get('c1'), null);
  store.close();
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

test('summarizeTurns keeps role labels', () => {
  const summary = summarizeTurns([
    { role: 'user', content: '請分析 site A' },
    { role: 'assistant', content: '先檢查資源健康' },
  ]);
  assert.match(summary, /操作員/);
  assert.match(summary, /助手/);
});
