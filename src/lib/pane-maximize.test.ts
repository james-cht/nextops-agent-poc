import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chatWidthCss,
  createPaneMaximizeState,
  maximizePane,
  restorePanes,
  setSplitRatio,
} from './pane-maximize.ts';

describe('Pane Maximize', () => {
  it('starts split with no pane maximized', () => {
    const s = createPaneMaximizeState(0.4);
    assert.equal(s.maximized, 'none');
    assert.equal(s.chatRatio, 0.4);
    assert.equal(chatWidthCss(s), '40%');
  });

  it('maximizing chat uses full width and remembers prior ratio', () => {
    let s = createPaneMaximizeState(0.35);
    s = maximizePane(s, 'chat');
    assert.equal(s.maximized, 'chat');
    assert.equal(s.chatRatio, 0.35);
    assert.equal(chatWidthCss(s), '100%');
  });

  it('maximizing brief hides chat width', () => {
    let s = createPaneMaximizeState(0.4);
    s = maximizePane(s, 'brief');
    assert.equal(s.maximized, 'brief');
    assert.equal(chatWidthCss(s), '0%');
  });

  it('restore returns to the last non-maximized ratio', () => {
    let s = createPaneMaximizeState(0.42);
    s = maximizePane(s, 'chat');
    s = restorePanes(s);
    assert.equal(s.maximized, 'none');
    assert.equal(chatWidthCss(s), '42%');
  });

  it('only one pane can be maximized; maximizing the other switches focus', () => {
    let s = createPaneMaximizeState(0.4);
    s = maximizePane(s, 'brief');
    s = maximizePane(s, 'chat');
    assert.equal(s.maximized, 'chat');
  });

  it('clamps split ratio updates while split', () => {
    let s = createPaneMaximizeState(0.4);
    s = setSplitRatio(s, 0.95);
    assert.equal(s.chatRatio, 0.8);
    s = setSplitRatio(s, 0.05);
    assert.equal(s.chatRatio, 0.2);
  });
});
