import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAnalysisWindowMove,
  applyAnalysisWindowResize,
  createAnalysisWindowLayout,
  maximizeAnalysisWindow,
  minimizeAnalysisWindow,
  restoreAnalysisWindow,
} from './analysis-window-layout.ts';

describe('Analysis Window layout', () => {
  it('starts floating with a default size in the bottom-right of a 1280x720 viewport', () => {
    const s = createAnalysisWindowLayout(1280, 720);
    assert.equal(s.mode, 'floating');
    assert.ok(s.width >= 360);
    assert.ok(s.height >= 240);
    assert.ok(s.x + s.width <= 1280);
    assert.ok(s.y + s.height <= 720);
  });

  it('restore after maximize returns the previous floating rect', () => {
    let s = createAnalysisWindowLayout(1280, 720);
    s = applyAnalysisWindowMove(s, 80, 90, 1280, 720);
    s = applyAnalysisWindowResize(s, 500, 360, 1280, 720);
    const before = { x: s.x, y: s.y, width: s.width, height: s.height };
    s = maximizeAnalysisWindow(s);
    assert.equal(s.mode, 'maximized');
    s = restoreAnalysisWindow(s);
    assert.equal(s.mode, 'floating');
    assert.deepEqual({ x: s.x, y: s.y, width: s.width, height: s.height }, before);
  });

  it('clamps a drag so the window stays inside the viewport', () => {
    let s = createAnalysisWindowLayout(800, 600);
    s = applyAnalysisWindowMove(s, 9999, 9999, 800, 600);
    assert.ok(s.x + s.width <= 800);
    assert.ok(s.y + s.height <= 600);
    s = applyAnalysisWindowMove(s, -40, -40, 800, 600);
    assert.ok(s.x >= 12);
    assert.ok(s.y >= 56);
  });
});
