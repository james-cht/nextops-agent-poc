/** True when a dashboard metric should ping after an in-place refresh. */
export function shouldFlashMetric(prev: unknown, next: unknown): boolean {
  if (prev === undefined) return false;
  if (Object.is(prev, next)) return false;
  if (next === '---' || prev === '---') return false;
  return true;
}
