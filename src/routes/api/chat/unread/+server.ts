import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { getChatUnreadSummary } from '$lib/server/operator-chat';

export const GET: RequestHandler = async ({ locals }) => {
  const username = locals.operatorKey?.trim();
  if (!username) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  return json(getChatUnreadSummary(username));
};
