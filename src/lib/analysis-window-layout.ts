/** Analysis Window floating geometry (ADR-0025) — session layout, not Local Settings Store. */

export type AnalysisWindowMode = 'floating' | 'minimized' | 'maximized';

export type AnalysisWindowLayout = {
  mode: AnalysisWindowMode;
  x: number;
  y: number;
  width: number;
  height: number;
};

const MARGIN = 12;
const HEADER = 56;
const MIN_W = 360;
const MIN_H = 240;
const DEFAULT_W = 480;
const DEFAULT_H = 420;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function createAnalysisWindowLayout(
  viewportWidth: number,
  viewportHeight: number,
): AnalysisWindowLayout {
  const vw = Math.max(viewportWidth, MIN_W + MARGIN * 2);
  const vh = Math.max(viewportHeight, MIN_H + HEADER + MARGIN);
  const width = Math.min(DEFAULT_W, vw - MARGIN * 2);
  const height = Math.min(DEFAULT_H, vh - HEADER - MARGIN);
  return {
    mode: 'floating',
    width,
    height,
    x: vw - width - MARGIN,
    y: vh - height - MARGIN,
  };
}

export function applyAnalysisWindowMove(
  state: AnalysisWindowLayout,
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
): AnalysisWindowLayout {
  if (state.mode !== 'floating') return state;
  const maxX = Math.max(MARGIN, viewportWidth - state.width - MARGIN);
  const maxY = Math.max(HEADER, viewportHeight - state.height - MARGIN);
  return {
    ...state,
    x: clamp(x, MARGIN, maxX),
    y: clamp(y, HEADER, maxY),
  };
}

export function applyAnalysisWindowResize(
  state: AnalysisWindowLayout,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): AnalysisWindowLayout {
  if (state.mode !== 'floating') return state;
  const maxW = Math.max(MIN_W, viewportWidth - state.x - MARGIN);
  const maxH = Math.max(MIN_H, viewportHeight - state.y - MARGIN);
  return {
    ...state,
    width: clamp(width, MIN_W, maxW),
    height: clamp(height, MIN_H, maxH),
  };
}

export function minimizeAnalysisWindow(state: AnalysisWindowLayout): AnalysisWindowLayout {
  return { ...state, mode: 'minimized' };
}

export function maximizeAnalysisWindow(state: AnalysisWindowLayout): AnalysisWindowLayout {
  return { ...state, mode: 'maximized' };
}

/** Restore to the last floating size/position (unchanged while min/max). */
export function restoreAnalysisWindow(state: AnalysisWindowLayout): AnalysisWindowLayout {
  return { ...state, mode: 'floating' };
}
