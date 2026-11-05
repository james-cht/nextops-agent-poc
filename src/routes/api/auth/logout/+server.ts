import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { base } from '$app/paths';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { kitPathsBase } from '$lib/public-base-path';
import { getLocalSettingsStore } from '$lib/server/local-settings-store';

export const POST: RequestHandler = async ({ cookies }) => {
  try {
    const id = cookies.get('session');
    if (id) {
      try {
        getLocalSettingsStore().revokeSession(id);
      } catch {
        /* store may not be open in tests */
      }
    }
    cookies.delete('session', { path: kitPathsBase(base) || '/' });
    return json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return json(createErrorResponse(ErrorCode.INTERNAL_ERROR, msg), { status: 500 });
  }
};
