import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { chatRoomVisibleTitle } from '$lib/operator-display-name';
import { OPSGPT_PARTICIPANT_ID, type ChatRoomSummary } from '$lib/operator-chat-types';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';
import { listChatRooms, openOperatorDm, openOpsgptDm } from '$lib/server/operator-chat';

async function roomsWithDisplayNames(username: string): Promise<ChatRoomSummary[]> {
  const settings = await ensureAppLocalSettings();
  const accounts = settings.listOperatorAccounts();
  return listChatRooms(username).map((room) => ({
    ...room,
    title: chatRoomVisibleTitle({ kind: room.kind, title: room.title, accounts }),
  }));
}

export const GET: RequestHandler = async ({ locals }) => {
  const username = locals.operatorKey?.trim();
  if (!username) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  return json({ rooms: await roomsWithDisplayNames(username) });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const username = locals.operatorKey?.trim();
  if (!username) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  const settings = await ensureAppLocalSettings();
  const account = settings.getOperatorAccount(username);
  if (!account || account.disabled) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  let payload: { counterpartId?: unknown };
  try {
    payload = (await request.json()) as { counterpartId?: unknown };
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'JSON body required'), { status: 400 });
  }
  const counterpartId = typeof payload.counterpartId === 'string' ? payload.counterpartId.trim() : '';
  if (!counterpartId) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'counterpartId is required'), { status: 400 });
  }
  if (counterpartId === OPSGPT_PARTICIPANT_ID) {
    const opened = openOpsgptDm(username);
    if (!opened.ok) {
      return json(createErrorResponse(ErrorCode.BAD_REQUEST, opened.error), { status: 400 });
    }
    const rooms = await roomsWithDisplayNames(username);
    const room = rooms.find((r) => r.id === opened.roomId);
    return json({ room });
  }
  if (counterpartId === username) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'cannot DM yourself'), { status: 400 });
  }
  const counterpart = settings.getOperatorAccount(counterpartId);
  if (!counterpart) {
    return json(createErrorResponse(ErrorCode.NOT_FOUND, 'Operator Account not found'), { status: 404 });
  }
  const opened = openOperatorDm(username, counterpart.username);
  if (!opened.ok) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, opened.error), { status: 400 });
  }
  const rooms = await roomsWithDisplayNames(username);
  const room = rooms.find((r) => r.id === opened.roomId);
  return json({ room });
};
