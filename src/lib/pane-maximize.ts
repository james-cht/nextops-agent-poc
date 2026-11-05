/** Pane Maximize / restore for `/ai` split (ADR-0026). Session-only; not Local Settings Store. */

export type MaximizedPane = 'none' | 'brief' | 'chat';

export type PaneMaximizeState = {
  /** Chat share of content width while split (clamped 0.2–0.8). */
  chatRatio: number;
  maximized: MaximizedPane;
};

const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;
const DEFAULT_RATIO = 0.38;

function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_RATIO;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

export function createPaneMaximizeState(chatRatio = DEFAULT_RATIO): PaneMaximizeState {
  return { chatRatio: clampRatio(chatRatio), maximized: 'none' };
}

export function maximizePane(
  state: PaneMaximizeState,
  pane: Exclude<MaximizedPane, 'none'>,
): PaneMaximizeState {
  return { ...state, maximized: pane };
}

export function restorePanes(state: PaneMaximizeState): PaneMaximizeState {
  return { ...state, maximized: 'none' };
}

export function setSplitRatio(state: PaneMaximizeState, ratio: number): PaneMaximizeState {
  if (state.maximized !== 'none') return state;
  return { ...state, chatRatio: clampRatio(ratio) };
}

/** CSS width for the OPSGPT pane. */
export function chatWidthCss(state: PaneMaximizeState): string {
  if (state.maximized === 'chat') return '100%';
  if (state.maximized === 'brief') return '0%';
  return `${Math.round(state.chatRatio * 100)}%`;
}

export function isBriefVisible(state: PaneMaximizeState): boolean {
  return state.maximized !== 'chat';
}

export function isChatVisible(state: PaneMaximizeState): boolean {
  return state.maximized !== 'brief';
}
