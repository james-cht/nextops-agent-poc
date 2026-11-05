import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SystemBehaviorTracker,
  parseTrackingRouteOverrides,
  sanitizeForTracking,
  shouldTrackRoute,
  shouldTrackDependencyRequest,
  shouldCaptureDependencyResponse,
  type SystemBehaviorTrackingConfig
} from './system-behavior-tracking.ts';

const runtime = {
  serviceName: 'nextops',
  instanceId: 'inst-1',
  containerId: 'cont-1',
  hostname: 'host-1',
  pid: 123
};

describe('system behavior tracking utils', () => {
  it('redacts sensitive keys recursively', () => {
    const payload = sanitizeForTracking({
      authorization: 'Bearer abc',
      nested: {
        token: 'secret-token',
        safe: 'ok'
      }
    }) as Record<string, unknown>;

    assert.equal(payload.authorization, '[REDACTED]');
    const nested = payload.nested as Record<string, unknown>;
    assert.equal(nested.token, '[REDACTED]');
    assert.equal(nested.safe, 'ok');
  });

  it('applies include/exclude route tracking rules', () => {
    const overrides = parseTrackingRouteOverrides('{"include":["/api"],"exclude":["/api/auth"],"bodyCaptureAllowlist":["/api/es/query"]}');
    assert.equal(shouldTrackRoute('/api/es/query', overrides), true);
    assert.equal(shouldTrackRoute('/api/auth/login', overrides), false);
    assert.equal(shouldTrackRoute('/logs', overrides), false);
  });

  it('tracks outbound dependency URLs even when pathname is not /api', () => {
    const overrides = parseTrackingRouteOverrides(undefined);
    const esPath = '/filebeat-*/_search';
    assert.equal(shouldTrackRoute(esPath, overrides), false);
    assert.equal(shouldTrackDependencyRequest(true), true);
    assert.equal(shouldTrackDependencyRequest(false), false);
  });

  it('captures dependency response bodies only on failure', () => {
    assert.equal(shouldCaptureDependencyResponse(false), true);
    assert.equal(shouldCaptureDependencyResponse(true), false);
  });
});

describe('SystemBehaviorTracker queue handling', () => {
  it('drops oldest events when queue reaches limit', async () => {
    const failedPersistence: Array<string> = [];
    const config: SystemBehaviorTrackingConfig = {
      enabled: true,
      persistEnabled: true,
      queueMax: 2,
      schemaVersion: '1.0',
      routeOverrides: parseTrackingRouteOverrides(undefined)
    };

    const originalLog = console.log;
    console.log = () => {};

    try {
      const tracker = new SystemBehaviorTracker(
        config,
        runtime,
        async (event) => {
          failedPersistence.push(event.requestId);
          throw new Error('force fail');
        }
      );

      tracker.track(tracker.buildEvent({
        severity: 'info',
        status: 'success',
        eventType: 'inbound_request',
        requestId: 'r1',
        route: '/api/es/query'
      }));
      tracker.track(tracker.buildEvent({
        severity: 'info',
        status: 'success',
        eventType: 'inbound_request',
        requestId: 'r2',
        route: '/api/es/query'
      }));
      tracker.track(tracker.buildEvent({
        severity: 'info',
        status: 'success',
        eventType: 'inbound_request',
        requestId: 'r3',
        route: '/api/es/query'
      }));

      await tracker.flushQueue();
      assert.equal(tracker.getDroppedCount(), 1);
      assert.equal(failedPersistence.includes('r1'), false);

      tracker.destroy();
    } finally {
      console.log = originalLog;
    }
  });
});
