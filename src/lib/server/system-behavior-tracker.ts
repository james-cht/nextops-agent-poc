import { Buffer } from 'node:buffer';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { fetch as undiciFetch } from 'undici';
import {
  SystemBehaviorTracker,
  parseTrackingRouteOverrides,
  type RuntimeIdentity,
  type SystemBehaviorTrackingConfig,
  type TrackingEvent,
} from '$lib/server/system-behavior-tracking';
import { computeSystemStatusSignals, type SystemStatusSnapshot } from '$lib/server/system-status-signal';

function isEnabled(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value === 'true';
}

function buildRuntimeIdentity(): RuntimeIdentity {
  const hostname = process.env.HOSTNAME || 'unknown-host';
  const instanceId = env.NEXTOPS_INSTANCE_ID || crypto.randomUUID();
  const containerIdMatch = hostname.match(/^[a-f0-9]{12,64}$/i);
  return {
    serviceName: 'nextops',
    instanceId,
    containerId: containerIdMatch ? hostname : 'unknown-container',
    hostname,
    pid: process.pid,
  };
}

function buildPersistenceEndpoint(): string {
  const prefix = env.SYSTEM_BEHAVIOR_TRACKING_ES_INDEX_PREFIX || 'nextops-system-tracking';
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
  const esBaseUrl = env.ES_BASE_URL || 'http://localhost:9200';
  return `${esBaseUrl}/${prefix}-${datePart}/_doc`;
}

function buildTrackingConfig(): SystemBehaviorTrackingConfig {
  return {
    enabled: isEnabled(env.SYSTEM_BEHAVIOR_TRACKING_ENABLED, false),
    persistEnabled: isEnabled(env.SYSTEM_BEHAVIOR_TRACKING_PERSIST_ES_ENABLED, false),
    queueMax: Number(env.SYSTEM_BEHAVIOR_TRACKING_QUEUE_MAX || '5000'),
    schemaVersion: '1.0',
    routeOverrides: parseTrackingRouteOverrides(env.SYSTEM_BEHAVIOR_TRACKING_ROUTE_OVERRIDES),
  };
}

const tracker = new SystemBehaviorTracker(
  buildTrackingConfig(),
  buildRuntimeIdentity(),
  async (event) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const esUser = publicEnv.PUBLIC_DEFAULT_ELASTICSEARCH_USER;
    const esPassword = publicEnv.PUBLIC_DEFAULT_ELASTICSEARCH_PASSWORD;
    if (esUser && esPassword) {
      const auth = Buffer.from(`${esUser}:${esPassword}`).toString('base64');
      headers.Authorization = `Basic ${auth}`;
    }

    const res = await undiciFetch(buildPersistenceEndpoint(), {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
    } as NonNullable<Parameters<typeof undiciFetch>[1]>);
    if (!res.ok) {
      throw new Error(`tracking persistence failed with status ${res.status}`);
    }
  },
);

export function getSystemBehaviorTracker(): SystemBehaviorTracker {
  return tracker;
}

export interface TrackingDashboardPayload {
  enabled: boolean;
  persistEnabled: boolean;
  runtime: RuntimeIdentity;
  droppedCount: number;
  events: TrackingEvent[];
  status: SystemStatusSnapshot | null;
}

export function getTrackingDashboardPayload(limit = 200): TrackingDashboardPayload {
  const enabled = tracker.isEnabled();
  const events = enabled ? tracker.getRecentEvents(limit) : [];
  return {
    enabled,
    persistEnabled: tracker.isPersistEnabled(),
    runtime: tracker.getRuntimeIdentity(),
    droppedCount: tracker.getDroppedCount(),
    events,
    status: enabled ? computeSystemStatusSignals(events) : null,
  };
}
