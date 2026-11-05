import { Buffer } from 'node:buffer';

export type TrackingSeverity = 'debug' | 'info' | 'warn' | 'error';
export type TrackingStatus = 'success' | 'failure';

export interface RuntimeIdentity {
  serviceName: string;
  instanceId: string;
  containerId: string;
  hostname: string;
  pid: number;
}

export interface TrackingRouteOverrides {
  include: string[];
  exclude: string[];
  bodyCaptureAllowlist: string[];
}

export interface SystemBehaviorTrackingConfig {
  enabled: boolean;
  persistEnabled: boolean;
  queueMax: number;
  schemaVersion: string;
  routeOverrides: TrackingRouteOverrides;
}

export interface TrackingEvent {
  schemaVersion: string;
  ts: string;
  severity: TrackingSeverity;
  status: TrackingStatus;
  eventType: 'inbound_request' | 'dependency_request' | 'tracking_pipeline';
  requestId: string;
  route: string;
  method?: string;
  service?: string;
  dependency?: string;
  url?: string;
  statusCode?: number;
  durationMs?: number;
  retryCount?: number;
  queueDroppedCount?: number;
  message?: string;
  errorCode?: string;
  errorClass?: string;
  requestBody?: unknown;
  responseBody?: unknown;
  requestBodyBytes?: number;
  responseBodyBytes?: number;
  metadata?: Record<string, unknown>;
  runtime: RuntimeIdentity;
}

type PersistFn = (event: TrackingEvent) => Promise<void>;

interface QueueItem {
  event: TrackingEvent;
  retries: number;
}

const SENSITIVE_KEY_RE = /(authorization|cookie|token|password|secret|apikey|api_key|x-api-key)/i;
const MAX_LOG_STRING_LENGTH = 800;
const MAX_RECENT_EVENTS = 2000;

function truncateString(value: string): string {
  if (value.length <= MAX_LOG_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_LOG_STRING_LENGTH)}...(truncated)`;
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') return truncateString(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== 'object') return value;

  const source = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }
    sanitized[key] = sanitizeValue(entry);
  }
  return sanitized;
}

export function sanitizeForTracking(payload: unknown): unknown {
  return sanitizeValue(payload);
}

export function parseTrackingRouteOverrides(raw: string | undefined): TrackingRouteOverrides {
  const defaults: TrackingRouteOverrides = {
    include: ['/api'],
    exclude: ['/api/auth'],
    bodyCaptureAllowlist: [
      '/api/logs/stream',
      '/api/es/query',
      '/api/diagnosis',
      '/api/sites/'
    ]
  };

  if (!raw) return defaults;

  try {
    const parsed = JSON.parse(raw) as Partial<TrackingRouteOverrides>;
    return {
      include: Array.isArray(parsed.include) ? parsed.include : defaults.include,
      exclude: Array.isArray(parsed.exclude) ? parsed.exclude : defaults.exclude,
      bodyCaptureAllowlist: Array.isArray(parsed.bodyCaptureAllowlist)
        ? parsed.bodyCaptureAllowlist
        : defaults.bodyCaptureAllowlist
    };
  } catch {
    return defaults;
  }
}

export function shouldTrackRoute(pathname: string, overrides: TrackingRouteOverrides): boolean {
  const included = overrides.include.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!included) return false;
  const excluded = overrides.exclude.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return !excluded;
}

/** Outbound dependency calls use full URLs, not NextOps /api routes. */
export function shouldTrackDependencyRequest(trackingEnabled: boolean): boolean {
  return trackingEnabled;
}

export function shouldCaptureDependencyResponse(responseOk: boolean): boolean {
  return !responseOk;
}

export function shouldCaptureBody(pathname: string, overrides: TrackingRouteOverrides): boolean {
  return overrides.bodyCaptureAllowlist.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  );
}

function computeBodyBytes(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return undefined;
  }
}

export class SystemBehaviorTracker {
  private readonly config: SystemBehaviorTrackingConfig;
  private readonly runtime: RuntimeIdentity;
  private readonly persistFn?: PersistFn;
  private readonly recentEvents: TrackingEvent[] = [];
  private queue: QueueItem[] = [];
  private droppedCount = 0;
  private flushing = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    config: SystemBehaviorTrackingConfig,
    runtime: RuntimeIdentity,
    persistFn?: PersistFn
  ) {
    this.config = config;
    this.runtime = runtime;
    this.persistFn = persistFn;
    if (this.config.persistEnabled && this.persistFn) {
      this.flushTimer = setInterval(() => {
        void this.flushQueue();
      }, 2000);
    }
  }

  buildEvent(base: Omit<TrackingEvent, 'schemaVersion' | 'ts' | 'runtime' | 'requestBodyBytes' | 'responseBodyBytes'>): TrackingEvent {
    const requestBody = sanitizeForTracking(base.requestBody);
    const responseBody = sanitizeForTracking(base.responseBody);
    return {
      ...base,
      schemaVersion: this.config.schemaVersion,
      ts: new Date().toISOString(),
      runtime: this.runtime,
      requestBody,
      responseBody,
      requestBodyBytes: computeBodyBytes(requestBody),
      responseBodyBytes: computeBodyBytes(responseBody)
    };
  }

  track(event: TrackingEvent): void {
    if (!this.config.enabled) return;
    this.rememberEvent(event);
    this.emitStdout(event);
    if (!this.config.persistEnabled || !this.persistFn) return;
    this.enqueue(event);
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  isPersistEnabled(): boolean {
    return this.config.persistEnabled;
  }

  getRouteOverrides(): TrackingRouteOverrides {
    return this.config.routeOverrides;
  }

  getRuntimeIdentity(): RuntimeIdentity {
    return this.runtime;
  }

  getRecentEvents(limit = 200): TrackingEvent[] {
    const bounded = Math.max(1, Math.min(limit, MAX_RECENT_EVENTS));
    return this.recentEvents.slice(-bounded).reverse();
  }

  getDroppedCount(): number {
    return this.droppedCount;
  }

  async flushQueue(): Promise<void> {
    if (!this.config.persistEnabled || !this.persistFn || this.flushing) return;
    this.flushing = true;
    try {
      while (this.queue.length > 0) {
        const current = this.queue[0];
        try {
          await this.persistFn(current.event);
          this.queue.shift();
        } catch {
          current.retries += 1;
          if (current.retries >= 3) {
            this.queue.shift();
            this.emitStdout(this.buildEvent({
              severity: 'warn',
              status: 'failure',
              eventType: 'tracking_pipeline',
              requestId: current.event.requestId,
              route: current.event.route,
              message: 'Dropping tracking event after max retries',
              retryCount: current.retries,
              queueDroppedCount: this.droppedCount,
              metadata: { originalEventType: current.event.eventType }
            }));
          }
          break;
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  destroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
  }

  private rememberEvent(event: TrackingEvent): void {
    this.recentEvents.push(event);
    if (this.recentEvents.length > MAX_RECENT_EVENTS) {
      this.recentEvents.shift();
    }
  }

  private enqueue(event: TrackingEvent): void {
    if (this.queue.length >= this.config.queueMax) {
      this.queue.shift();
      this.droppedCount += 1;
      this.emitStdout(this.buildEvent({
        severity: 'warn',
        status: 'failure',
        eventType: 'tracking_pipeline',
        requestId: event.requestId,
        route: event.route,
        message: 'Tracking queue full, dropping oldest event',
        queueDroppedCount: this.droppedCount
      }));
    }
    this.queue.push({ event, retries: 0 });
  }

  private emitStdout(event: TrackingEvent): void {
    try {
      console.log(JSON.stringify(event));
    } catch {
      console.log('{"eventType":"tracking_pipeline","severity":"error","message":"Failed to serialize tracking event"}');
    }
  }
}
