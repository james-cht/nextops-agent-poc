import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { ensureAppLocalSettings, verifyStepUpPassword } from '$lib/server/app-local-settings';
import { ownerError, requirePlatformOwner } from '$lib/server/require-platform-owner';
import { appendConfigAuditEntry } from '$lib/server/config-audit-log';
import { parseModelRateTable, resolveModelRateTable } from '$lib/model-rate-table';

export const GET: RequestHandler = async ({ locals }) => {
  const store = await ensureAppLocalSettings();
  const gate = requirePlatformOwner(store, locals.operatorKey);
  if (!gate.ok) return ownerError(gate);
  return json({ rates: resolveModelRateTable(store.getModelRateTable()) });
};

export const PUT: RequestHandler = async ({ request, locals }) => {
  const store = await ensureAppLocalSettings();
  const gate = requirePlatformOwner(store, locals.operatorKey);
  if (!gate.ok) return ownerError(gate);
  let body: { adminPassword?: unknown; rates?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid JSON body'), { status: 400 });
  }
  const ok = await verifyStepUpPassword(typeof body.adminPassword === 'string' ? body.adminPassword : '');
  if (!ok) {
    appendConfigAuditEntry(
      {
        action: 'save',
        setting: 'model_rate_table',
        outcome: 'rejected',
        actor: gate.username,
        detail: { reason: 'bad_password' },
      },
      { store },
    );
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Admin password required'), { status: 401 });
  }
  const parsed = parseModelRateTable(body.rates);
  if (!parsed) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid Model Rate Table'), { status: 400 });
  }
  store.setModelRateTable(parsed);
  appendConfigAuditEntry(
    {
      action: 'save',
      setting: 'model_rate_table',
      outcome: 'saved',
      actor: gate.username,
      detail: { models: Object.keys(parsed) },
    },
    { store },
  );
  return json({ rates: resolveModelRateTable(parsed), notice: '一經修改即會生效' });
};
