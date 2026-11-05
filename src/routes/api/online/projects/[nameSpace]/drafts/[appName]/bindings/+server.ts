import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { canOpenApplicationOnline } from '$lib/application-online';
import {
  saveServiceDeployEnvironmentBindings,
  type ActionFail,
} from '$lib/server/application-online-actions';
import { getApplicationOnlineStore } from '$lib/server/application-online-store';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';
import {
  RESOURCE_REQUEST_KINDS,
  type ResourceRequestKind,
} from '$lib/resource-request';
import type { EnvironmentBindingInput } from '$lib/environment-binding';

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
  let body: { bindings?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid JSON body'), { status: 400 });
  }
  const bindings: EnvironmentBindingInput[] = [];
  if (Array.isArray(body.bindings)) {
    for (const raw of body.bindings) {
      if (!raw || typeof raw !== 'object') continue;
      const environment = (raw as { environment?: unknown }).environment;
      const kind = (raw as { kind?: unknown }).kind;
      if (typeof environment !== 'string' || typeof kind !== 'string') continue;
      if (!(RESOURCE_REQUEST_KINDS as readonly string[]).includes(kind)) continue;
      const fieldsRaw = (raw as { fields?: unknown }).fields;
      const fields: Record<string, string> = {};
      if (fieldsRaw && typeof fieldsRaw === 'object' && !Array.isArray(fieldsRaw)) {
        for (const [k, v] of Object.entries(fieldsRaw as Record<string, unknown>)) {
          if (typeof v === 'string') fields[k] = v;
        }
      }
      bindings.push({
        environment,
        kind: kind as ResourceRequestKind,
        fields,
      });
    }
  }
  const result = saveServiceDeployEnvironmentBindings({
    store: getApplicationOnlineStore(),
    account,
    nameSpace: params.nameSpace,
    appName: params.appName,
    bindings,
  });
  if (!result.ok) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, result.error), {
      status: failStatus(result.code),
    });
  }
  return json({ ok: true, bindings: result.bindings });
};
