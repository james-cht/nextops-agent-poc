import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';
import { ownerError, requirePlatformOwner } from '$lib/server/require-platform-owner';

function orchBase(): string {
  return (env.ORCH_BASE_URL || 'http://127.0.0.1:3200').replace(/\/+$/, '');
}

export const GET: RequestHandler = async ({ locals, url }) => {
  const store = await ensureAppLocalSettings();
  const gate = requirePlatformOwner(store, locals.operatorKey);
  if (!gate.ok) return ownerError(gate);
  const limit = url.searchParams.get('limit') || '50';
  try {
    const res = await fetch(`${orchBase()}/traces?limit=${encodeURIComponent(limit)}`);
    if (!res.ok) {
      return json(createErrorResponse(ErrorCode.UPSTREAM_ERROR, 'Failed to list Diagnosis Traces'), {
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
