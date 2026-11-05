import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';
import { markReleaseNotesRead } from '$lib/server/release-notes-snapshot';

/** PUT /api/release-notes/read — mark the running Release Version as Last-Read. */
export const PUT: RequestHandler = async ({ locals }) => {
  const username = locals.operatorKey?.trim();
  if (!username) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  const store = await ensureAppLocalSettings();
  return json(markReleaseNotesRead(store, username));
};
