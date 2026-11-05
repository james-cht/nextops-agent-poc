import type { TrackingEvent } from './system-behavior-tracking';

export type SignalLevel = 'healthy' | 'degraded' | 'critical';

export interface DependencySignal {
  dependency: string;
  level: SignalLevel;
  successRate: number;
  p95DurationMs: number;
  retryRate: number;
  queueDrops: number;
  sampleCount: number;
}

export interface SystemStatusSnapshot {
  windowMinutes: number;
  generatedAt: string;
  dependencies: DependencySignal[];
  overallLevel: SignalLevel;
}

const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function classifyDependency(
  successRate: number,
  p95DurationMs: number,
  retryRate: number,
  queueDrops: number,
): SignalLevel {
  if (successRate < 95 || p95DurationMs > 3000 || queueDrops > 0) return 'critical';
  if (successRate < 99 || p95DurationMs > 1000 || retryRate > 2) return 'degraded';
  return 'healthy';
}

function worstLevel(levels: SignalLevel[]): SignalLevel {
  if (levels.includes('critical')) return 'critical';
  if (levels.includes('degraded')) return 'degraded';
  return 'healthy';
}

export function computeSystemStatusSignals(
  events: TrackingEvent[],
  windowMs = DEFAULT_WINDOW_MS,
  now = Date.now(),
): SystemStatusSnapshot {
  const cutoff = now - windowMs;
  const recent = events.filter((event) => new Date(event.ts).getTime() >= cutoff);

  const dependencyEvents = recent.filter(
    (event) => event.eventType === 'dependency_request' && event.dependency,
  );

  const queueDrops = recent
    .filter((event) => event.eventType === 'tracking_pipeline')
    .reduce((sum, event) => sum + (event.queueDroppedCount ?? 0), 0);

  const byDependency = new Map<string, TrackingEvent[]>();
  for (const event of dependencyEvents) {
    const key = event.dependency as string;
    const bucket = byDependency.get(key) ?? [];
    bucket.push(event);
    byDependency.set(key, bucket);
  }

  const dependencies: DependencySignal[] = [...byDependency.entries()].map(([dependency, bucket]) => {
    const successes = bucket.filter((event) => event.status === 'success').length;
    const sampleCount = bucket.length;
    const successRate = sampleCount === 0 ? 100 : (successes / sampleCount) * 100;
    const durations = bucket
      .map((event) => event.durationMs)
      .filter((value): value is number => typeof value === 'number');
    const p95DurationMs = percentile(durations, 95);
    const retries = bucket.filter((event) => (event.retryCount ?? 0) > 0).length;
    const retryRate = sampleCount === 0 ? 0 : (retries / sampleCount) * 100;

    return {
      dependency,
      level: classifyDependency(successRate, p95DurationMs, retryRate, queueDrops),
      successRate: Math.round(successRate * 10) / 10,
      p95DurationMs: Math.round(p95DurationMs),
      retryRate: Math.round(retryRate * 10) / 10,
      queueDrops,
      sampleCount,
    };
  });

  dependencies.sort((a, b) => a.dependency.localeCompare(b.dependency));

  return {
    windowMinutes: Math.round(windowMs / 60000),
    generatedAt: new Date(now).toISOString(),
    dependencies,
    overallLevel: worstLevel(dependencies.map((signal) => signal.level)),
  };
}
