import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatFieldTableForCopy,
  formatJsonForCopy,
  isMessageFieldPath,
  orderCatalogFamilies,
} from './log-content-copy.ts';

describe('log-content-copy', () => {
  it('detects message field paths', () => {
    assert.equal(isMessageFieldPath('message'), true);
    assert.equal(isMessageFieldPath('log'), true);
    assert.equal(isMessageFieldPath('kubernetes.pod_name'), false);
  });

  it('formats field table lines', () => {
    assert.equal(
      formatFieldTableForCopy([
        { path: 'a', value: 1 },
        { path: 'message', value: 'hello' },
      ]),
      'a: 1\nmessage: hello',
    );
  });

  it('formats json with indentation', () => {
    assert.match(formatJsonForCopy({ x: 1 }), /"x": 1/);
  });

  it('orders catalog: selected (save order) then unselected (search order)', () => {
    const ordered = orderCatalogFamilies(
      ['logs-yt-b-*', 'logs-yt-a-*'],
      ['logs-yt-c-*', 'logs-yt-a-*', 'logs-yt-d-*'],
    );
    assert.deepEqual(ordered, [
      'logs-yt-b-*',
      'logs-yt-a-*',
      'logs-yt-c-*',
      'logs-yt-d-*',
    ]);
  });

  it('after deselecting the first selected, remaining selected stay checked in display model', () => {
    // Repro for Watchlist catalog UI desync: unkeyed each + reorder left the first
    // checkbox DOM node unchecked while it was reused for the next selected family.
    let selected = ['A', 'B', 'C', 'D'];
    const families = ['A', 'B', 'C', 'D', 'E'];
    selected = selected.filter((x) => x !== 'A');
    const display = orderCatalogFamilies(selected, families);
    const states = display.map((fam) => ({ fam, checked: selected.includes(fam) }));
    assert.equal(selected.length, 3);
    assert.deepEqual(
      states.filter((s) => s.checked).map((s) => s.fam),
      ['B', 'C', 'D'],
    );
    assert.equal(states[0]?.fam, 'B');
    assert.equal(states[0]?.checked, true);
  });
});
