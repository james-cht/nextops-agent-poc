import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { buildChatRoster } from '$lib/operator-chat-access';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';

export const GET: RequestHandler = async ({ locals }) => {
  const username = locals.operatorKey?.trim();
  if (!username) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  const settings = await ensureAppLocalSettings();
  const account = settings.getOperatorAccount(username);
  if (!account || account.disabled) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  return json({
    roster: buildChatRoster({
      viewerUsername: username,
      accounts: settings.listOperatorAccounts(),
    }),
  });
};
