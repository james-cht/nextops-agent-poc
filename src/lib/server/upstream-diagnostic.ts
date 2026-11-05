import { registerError } from '$lib/server/diagnosis';
import { getSystemBehaviorTracker } from '$lib/server/system-behavior-tracker';

export interface UpstreamDiagnosticContext {
  service: string;
  message: string;
  detail?: string;
  requestId?: string;
  upstreamUrl?: string;
  siteId?: string;
  dependency?: string;
  proxyEnabled?: boolean;
}

/** Registers upstream failures for UI and emits structured stderr for container log collectors. */
export function recordUpstreamDiagnostic(context: UpstreamDiagnosticContext): void {
  registerError(context.service, context.message, context.detail);

  const diagnostic = {
    type: 'upstream_diagnostic',
    ts: new Date().toISOString(),
    service: context.service,
    message: context.message,
    detail: context.detail,
    requestId: context.requestId,
    upstreamUrl: context.upstreamUrl,
    siteId: context.siteId,
    dependency: context.dependency,
    proxyEnabled: context.proxyEnabled,
  };

  try {
    console.error(JSON.stringify(diagnostic));
  } catch {
    console.error(`[upstream_diagnostic] ${context.service}: ${context.message}`);
  }

  const tracker = getSystemBehaviorTracker();
  if (!tracker.isEnabled()) return;

  tracker.track(tracker.buildEvent({
    severity: 'error',
    status: 'failure',
    eventType: 'dependency_request',
    requestId: context.requestId ?? 'unknown',
    route: context.upstreamUrl ?? context.service,
    dependency: context.dependency ?? context.service,
    url: context.upstreamUrl,
    message: context.message,
    errorCode: context.detail,
    metadata: {
      siteId: context.siteId,
      diagnosticType: 'upstream_diagnostic',
    },
    queueDroppedCount: tracker.getDroppedCount(),
  }));
}
