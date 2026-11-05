import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { canOpenApplicationOnline } from '$lib/application-online';
import {
  saveServiceDeployResourceRequests,
  type ActionFail,
} from '$lib/server/application-online-actions';
import { getApplicationOnlineStore } from '$lib/server/application-online-store';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';
import {
  RESOURCE_REQUEST_KINDS,
  type ResourceRequestKind,
  type ResourceRequestSheetInput,
} from '$lib/resource-request';

function failStatus(code: ActionFail['code']): number {
  if (code === 'FORBIDDEN') return 403;
  if (code === 'CONFLICT' || code === 'NEEDS_CHOICE') return 409;
  if (code === 'NOT_FOUND') return 404;
  return 400;
}

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.operatorKey) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  const settings = await ensureAppLocalSettings();
  const account = settings.getOperatorAccount(locals.operatorKey);
  if (!account || account.disabled || !canOpenApplicationOnline(account.role)) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Application Online access denied'), {
      status: 403,
    });
  }
  let body: { sheets?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid JSON body'), { status: 400 });
  }
  const sheets: ResourceRequestSheetInput[] = [];
  if (Array.isArray(body.sheets)) {
    for (const raw of body.sheets) {
      if (!raw || typeof raw !== 'object') continue;
      const kind = (raw as { kind?: unknown }).kind;
      if (typeof kind !== 'string' || !(RESOURCE_REQUEST_KINDS as readonly string[]).includes(kind)) {
        continue;
      }
      const fieldsRaw = (raw as { fields?: unknown }).fields;
      const fields: Record<string, string> = {};
      if (fieldsRaw && typeof fieldsRaw === 'object' && !Array.isArray(fieldsRaw)) {
        for (const [k, v] of Object.entries(fieldsRaw as Record<string, unknown>)) {
          if (typeof v === 'string') fields[k] = v;
        }
      }
      sheets.push({ kind: kind as ResourceRequestKind, fields });
    }
  }
  const result = saveServiceDeployResourceRequests({
    store: getApplicationOnlineStore(),
    account,
    nameSpace: params.nameSpace,
    appName: params.appName,
    sheets,
  });
  if (!result.ok) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, result.error), {
      status: failStatus(result.code),
    });
  }
  return json({ ok: true, sheets: result.sheets });
};
