import { json } from '@sveltejs/kit';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import type { LocalSettingsStore } from './local-settings-store.ts';
import { canViewDiagnosisTraces } from '$lib/operator-role';

export function requirePlatformOwner(
  store: LocalSettingsStore,
  operatorKey: string | null | undefined,
): { ok: true; username: string } | { ok: false; status: 401 | 403; body: ReturnType<typeof createErrorResponse> } {
  if (!operatorKey) {
    return {
      ok: false,
      status: 401,
      body: createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'),
    };
  }
  const account = store.getOperatorAccount(operatorKey);
  if (!account || account.disabled || !canViewDiagnosisTraces(account.role)) {
    return {
      ok: false,
      status: 403,
      body: createErrorResponse(ErrorCode.UNAUTHORIZED, 'Platform Owner required'),
    };
  }
  return { ok: true, username: account.username };
}

export function ownerError(denied: { status: 401 | 403; body: ReturnType<typeof createErrorResponse> }) {
  return json(denied.body, { status: denied.status });
}
