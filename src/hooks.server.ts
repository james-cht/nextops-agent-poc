import { redirect, json } from '@sveltejs/kit';
import type { Handle, HandleFetch } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { fetch as undiciFetch } from 'undici';
import { base } from '$app/paths';
import { kitPathsBase, joinPublicPath, withPublicBasePath } from '$lib/public-base-path';
import { getProxyAgent, initGlobalProxy } from '$lib/server/proxy';
import {
  shouldTrackRoute,
  shouldCaptureBody,
  shouldTrackDependencyRequest,
  shouldCaptureDependencyResponse,
} from '$lib/server/system-behavior-tracking';
import { getSystemBehaviorTracker } from '$lib/server/system-behavior-tracker';
import { getRequestId, requestContext } from '$lib/server/request-context';
import {
  envValuesFromProcess,
  getEffectiveDifyCredentials,
} from '$lib/server/dify-credentials';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';
import { getLocalSettingsStore } from '$lib/server/local-settings-store';
import { isHealthPath, isSessionExemptPath, isToolPath, sessionLoginLocation } from '$lib/server/auth-path-policy';

initGlobalProxy();

const tracker = getSystemBehaviorTracker();

function inferDependency(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('elastic') || parsed.port === '9200') return 'Elasticsearch';
    if (host.includes('prometheus') || host.includes('thanos')) return 'Prometheus';
    if (host.includes('dify')) return 'Dify';
    if (host.includes('mysql') || parsed.port === '3306') return 'MySQL';
    if (parsed.pathname.startsWith('/api')) return 'NextOps';
  } catch {
    // keep Unknown
  }
  return 'Unknown';
}

async function readBodyForTracking(request: Request, allowBodyCapture: boolean): Promise<unknown> {
  if (!allowBodyCapture) return undefined;
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;

  const contentType = request.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      return await request.clone().json();
    }
    if (contentType.startsWith('text/')) {
      return await request.clone().text();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  try {
    const url = new URL(request.url);
    if (url.origin === event.url.origin) {
      const current = `${url.pathname}${url.search}${url.hash}`;
      const nextPath = withPublicBasePath(current, base);
      if (nextPath !== current) {
        request = new Request(new URL(nextPath, url.origin), request);
      }
    }
  } catch {
    // keep original request
  }
  const requestId = request.headers.get('x-request-id') || getRequestId() || crypto.randomUUID();
  const route = (() => {
    try {
      return new URL(request.url).pathname;
    } catch {
      return request.url;
    }
  })();
  const shouldTrack = shouldTrackDependencyRequest(tracker.isEnabled());
  const startedAt = Date.now();
  const requestBody = await readBodyForTracking(request, false);

  const agent = getProxyAgent();
  if (!agent) {
    const response = await fetch(request);
    if (shouldTrack) {
      tracker.track(tracker.buildEvent({
        severity: response.ok ? 'info' : 'error',
        status: response.ok ? 'success' : 'failure',
        eventType: 'dependency_request',
        requestId,
        route,
        method: request.method,
        dependency: inferDependency(request.url),
        url: request.url,
        statusCode: response.status,
        durationMs: Date.now() - startedAt,
        requestBody,
        responseBody: shouldCaptureDependencyResponse(response.ok)
          ? await response.clone().text()
          : undefined,
        queueDroppedCount: tracker.getDroppedCount(),
      }));
    }
    return response;
  }

  const init: RequestInit & { dispatcher: typeof agent } = {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
    dispatcher: agent,
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const response = (await undiciFetch(
    request.url,
    init as NonNullable<Parameters<typeof undiciFetch>[1]>,
  )) as unknown as Response;

  if (shouldTrack) {
    tracker.track(tracker.buildEvent({
      severity: response.ok ? 'info' : 'error',
      status: response.ok ? 'success' : 'failure',
      eventType: 'dependency_request',
      requestId,
      route,
      method: request.method,
      dependency: inferDependency(request.url),
      url: request.url,
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      requestBody,
      responseBody: shouldCaptureDependencyResponse(response.ok)
        ? await response.clone().text()
        : undefined,
      queueDroppedCount: tracker.getDroppedCount(),
    }));
  }

  return response;
};

export const handle: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname;
  const requestId = event.request.headers.get('x-request-id') || crypto.randomUUID();
  event.locals.requestId = requestId;

  return requestContext.run({ requestId }, async () => {
    const prefix = kitPathsBase(base);
    if (prefix && path === prefix) {
      throw redirect(308, joinPublicPath(prefix, '/'));
    }

    // Health must not depend on Local Settings Store (writable .data); keep probe cheap.
    if (isHealthPath(path, base)) {
      const response = await resolve(event);
      response.headers.set('x-request-id', requestId);
      return response;
    }

    await ensureAppLocalSettings();

    const routeOverrides = tracker.getRouteOverrides();
    const shouldTrack = shouldTrackRoute(path, routeOverrides);
    const shouldTrackBody = shouldCaptureBody(path, routeOverrides);
    const startedAt = Date.now();
    const requestBody = await readBodyForTracking(event.request, shouldTrackBody);

    if (shouldTrack) {
      tracker.track(tracker.buildEvent({
        severity: 'info',
        status: 'success',
        eventType: 'inbound_request',
        requestId,
        route: path,
        method: event.request.method,
        message: 'request_start',
        requestBody,
        queueDroppedCount: tracker.getDroppedCount(),
      }));
    }

    let response: Response | undefined;
    let capturedError: unknown;
    try {
      if (isSessionExemptPath(path, base)) {
        response = await resolve(event);
        response.headers.set('x-request-id', requestId);
        return response;
      }

      if (isToolPath(path, base)) {
        const auth = event.request.headers.get('Authorization');
        const toolToken = getEffectiveDifyCredentials({
          env: envValuesFromProcess(env),
        }).toolToken;
        if (toolToken && auth === `Bearer ${toolToken}`) {
          response = await resolve(event);
          response.headers.set('x-request-id', requestId);
          return response;
        }
      }

      const sessionCookie = event.cookies.get('session');
      if (!sessionCookie) {
        if (isToolPath(path, base)) {
          response = json(
            {
              error: {
                code: 'UNAUTHORIZED',
                message: 'Missing or invalid auth',
                detail: 'Bearer token or session required',
              },
            },
            { status: 401 },
          );
          response.headers.set('x-request-id', requestId);
          return response;
        }
        throw redirect(303, sessionLoginLocation(base));
      }

      try {
        const store = getLocalSettingsStore();
        const session = store.getSession(sessionCookie);
        if (!session) {
          if (isToolPath(path, base)) {
            response = json(
              {
                error: {
                  code: 'UNAUTHORIZED',
                  message: 'Missing or invalid auth',
                  detail: 'Bearer token or session required',
                },
              },
              { status: 401 },
            );
            response.headers.set('x-request-id', requestId);
            return response;
          }
          throw redirect(303, sessionLoginLocation(base));
        }
        store.touchSession(session.id);
        event.locals.operatorKey = session.username;
        event.locals.sessionId = session.id;
      } catch (err) {
        if (err && typeof err === 'object' && 'status' in err) throw err;
        if (isToolPath(path, base)) {
          response = json(
            {
              error: {
                code: 'UNAUTHORIZED',
                message: 'Missing or invalid auth',
                detail: 'Bearer token or session required',
              },
            },
            { status: 401 },
          );
          response.headers.set('x-request-id', requestId);
          return response;
        }
        throw redirect(303, sessionLoginLocation(base));
      }

      response = await resolve(event);
      response.headers.set('x-request-id', requestId);
      return response;
    } catch (error) {
      capturedError = error;
      throw error;
    } finally {
      if (shouldTrack) {
        const statusCode = response?.status ?? (capturedError && typeof capturedError === 'object' && 'status' in capturedError
          ? Number((capturedError as { status?: number }).status)
          : 500);
        tracker.track(tracker.buildEvent({
          severity: statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info',
          status: statusCode >= 500 ? 'failure' : 'success',
          eventType: 'inbound_request',
          requestId,
          route: path,
          method: event.request.method,
          statusCode,
          durationMs: Date.now() - startedAt,
          requestBody,
          responseBody: undefined,
          queueDroppedCount: tracker.getDroppedCount(),
          message: capturedError ? 'request_failed' : 'request_completed',
          errorClass: capturedError instanceof Error ? capturedError.name : undefined,
          errorCode: capturedError instanceof Error ? capturedError.message : undefined,
        }));
      }
    }
  });
};
