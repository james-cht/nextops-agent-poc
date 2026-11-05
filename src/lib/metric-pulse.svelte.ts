import { shouldFlashMetric } from './metric-flash.ts';

const HOLD_MS = 950;

/** Replay a CSS ping class whenever `read()` returns a new settled value. */
export function metricPulse(read: () => unknown) {
  let live = $state(false);
  let primed = false;
  let prev: unknown;

  $effect(() => {
    const next = read();
    if (!primed) {
      primed = true;
      prev = next;
      return;
    }
    if (!shouldFlashMetric(prev, next)) {
      prev = next;
      return;
    }
    prev = next;
    live = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      live = true;
      timeout = setTimeout(() => {
        live = false;
      }, HOLD_MS);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (timeout) clearTimeout(timeout);
    };
  });

  return {
    get live() {
      return live;
    },
    settle() {
      live = false;
    },
  };
}
