import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';
import { ownerError, requirePlatformOwner } from '$lib/server/require-platform-owner';

function orchBase(): string {
  return (env.ORCH_BASE_URL || 'http://127.0.0.1:3200').replace(/\/+$/, '');
}

export const GET: RequestHandler = async ({ locals, params }) => {
  const store = await ensureAppLocalSettings();
  const gate = requirePlatformOwner(store, locals.operatorKey);
  if (!gate.ok) return ownerError(gate);
  const id = params.id ?? '';
  if (!id) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'id is required'), { status: 400 });
  }
  try {
    const res = await fetch(`${orchBase()}/traces/${encodeURIComponent(id)}`);
    if (res.status === 404) {
      return json(createErrorResponse(ErrorCode.NOT_FOUND, 'Diagnosis Trace not found'), { status: 404 });
    }
    if (!res.ok) {
      return json(createErrorResponse(ErrorCode.UPSTREAM_ERROR, 'Failed to load Diagnosis Trace'), {
        status: 502,
      });
    }
    return json(await res.json());
  } catch {
    return json(createErrorResponse(ErrorCode.UPSTREAM_ERROR, 'LangGraph orchestrator unreachable'), {
      status: 502,
    });
  }
};
