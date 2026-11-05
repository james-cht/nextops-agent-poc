import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env as privateEnv } from '$env/dynamic/private';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { getSiteCatalogEntry } from '$lib/server/site-catalog';
import { getLocalSettingsStore } from '$lib/server/local-settings-store';
import { livePodDiagnosticsGateMessage } from '$lib/live-pod-diagnostics';
import {
  generateLivePodDiagnosticsTaskId,
  loadLivePodDiagnosticsResult,
  robustaApiDiagnosticContext,
  ROBUSTA_API_DIAGNOSTIC_SERVICE,
  startLivePodDiagnostics,
} from '$lib/server/live-pod-diagnostics-run';
import { listMissingLivePodDiagnosticsTriggerEnv } from '$lib/server/live-pod-diagnostics-env';
import { isRobustaStoreConfigured, robustaPool, robustaStoreConfigGapMessage } from '$lib/server/robusta-mysql';
import { recordUpstreamDiagnostic } from '$lib/server/upstream-diagnostic';
import { clearError } from '$lib/server/diagnosis';
import { isProxyEnabled } from '$lib/server/proxy';
import { isMysqlProxyEnabled } from '$lib/server/mysql-proxy';
import { proxyFetch } from '$lib/server/proxy-fetch';

function requireOperator(locals: App.Locals): string | null {
  const key = locals.operatorKey?.trim();
  return key || null;
}

function startStatus(code: string): number {
  if (code === 'VIEWER' || code === 'NO_COVERAGE') return 403;
  if (code === 'IN_FLIGHT') return 409;
  if (code === 'TRIGGER_FAILED' || code === 'NOT_CONFIGURED') return 502;
  return 400;
}

async function queryDiagnostics(sql: string, params: unknown[]): Promise<unknown[]> {
  const [rows] = (await robustaPool.query(sql, params)) as unknown as [unknown[]];
  return rows ?? [];
}

/** GET occupancy for a Site, or one Task result by taskId. */
export const GET: RequestHandler = async ({ url, locals }) => {
  if (!requireOperator(locals)) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Operator session required'), { status: 401 });
  }
  const taskId = url.searchParams.get('taskId')?.trim() ?? '';
  const siteId = url.searchParams.get('siteId')?.trim() ?? '';
  const store = getLocalSettingsStore();

  if (taskId) {
    if (!isRobustaStoreConfigured()) {
      const message = robustaStoreConfigGapMessage();
      recordUpstreamDiagnostic({
        service: 'Robusta Store',
        message,
        dependency: 'MySQL',
        siteId: siteId || undefined,
        proxyEnabled: isMysqlProxyEnabled(),
      });
      return json(createErrorResponse(ErrorCode.UPSTREAM_ERROR, message), { status: 502 });
    }
    try {
      const loaded = await loadLivePodDiagnosticsResult({
        store,
        taskId,
        query: queryDiagnostics,
      });
      return json({
        taskId,
        phase: loaded.phase,
        occupancy: loaded.occupancy,
        row: loaded.row,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      recordUpstreamDiagnostic({
        service: 'Robusta Store',
        message: msg,
        dependency: 'MySQL',
        siteId: siteId || undefined,
        proxyEnabled: isMysqlProxyEnabled(),
      });
      return json(createErrorResponse(ErrorCode.UPSTREAM_ERROR, msg), { status: 502 });
    }
  }

  if (!siteId) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'siteId or taskId is required'), { status: 400 });
  }
  if (!getSiteCatalogEntry(siteId)) {
    return json(createErrorResponse(ErrorCode.NOT_FOUND, `Site not found: ${siteId}`), { status: 404 });
  }
  return json({ siteId, items: store.listLivePodOccupancy(siteId) });
};

/** POST start Live Pod Diagnostics for one selected log `_source`. */
export const POST: RequestHandler = async ({ request, locals }) => {
  const operatorKey = requireOperator(locals);
  if (!operatorKey) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Operator session required'), { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'JSON body required'), { status: 400 });
  }
  const siteId = String((body as { siteId?: unknown }).siteId ?? '').trim();
  if (!siteId) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'siteId is required'), { status: 400 });
  }
  const site = getSiteCatalogEntry(siteId);
  if (!site) {
    return json(createErrorResponse(ErrorCode.NOT_FOUND, `Site not found: ${siteId}`), { status: 404 });
  }
  const source = (body as { source?: unknown }).source;
  const store = getLocalSettingsStore();
  const account = store.getOperatorAccount(operatorKey);
  const triggerUrl = privateEnv.ROBUSTA_ACTION_URL ?? '';
  const actionToken = privateEnv.ROBUSTA_ACTION_TOKEN ?? '';
  const missing = listMissingLivePodDiagnosticsTriggerEnv({ url: triggerUrl, token: actionToken });
  if (missing.length) {
    recordUpstreamDiagnostic(
      robustaApiDiagnosticContext({
        siteId,
        triggerUrl,
        code: 'NOT_CONFIGURED',
        proxyEnabled: isProxyEnabled(),
      }),
    );
    return json(
      createErrorResponse(
        ErrorCode.UPSTREAM_ERROR,
        livePodDiagnosticsGateMessage('NOT_CONFIGURED'),
      ),
      { status: 502 },
    );
  }

  const result = await startLivePodDiagnostics({
    store,
    siteId,
    sources: [source],
    robustaCoverage: site.robustaCoverage === true,
    role: account?.role,
    triggerUrl,
    actionToken,
    taskId: generateLivePodDiagnosticsTaskId(),
    fetchImpl: proxyFetch,
  });

  if (!result.ok) {
    if (result.code === 'TRIGGER_FAILED' || result.code === 'NOT_CONFIGURED') {
      recordUpstreamDiagnostic(
        robustaApiDiagnosticContext({
          siteId,
          triggerUrl,
          code: result.code,
          upstreamStatus: result.upstreamStatus,
          upstreamMessage: result.upstreamMessage,
          proxyEnabled: isProxyEnabled(),
          token: actionToken,
        }),
      );
    }
    const http = startStatus(result.code);
    const apiCode =
      http === 403
        ? ErrorCode.UNAUTHORIZED
        : http === 502
          ? ErrorCode.UPSTREAM_ERROR
          : ErrorCode.BAD_REQUEST;
    return json(
      {
        ...createErrorResponse(apiCode, livePodDiagnosticsGateMessage(result.code)),
        gate: result.code,
        taskId: result.taskId ?? null,
      },
      { status: http },
    );
  }

  clearError(ROBUSTA_API_DIAGNOSTIC_SERVICE);
  return json({
    ok: true,
    taskId: result.taskId,
    occupancy: result.occupancy,
    phase: 'pending',
  });
};
