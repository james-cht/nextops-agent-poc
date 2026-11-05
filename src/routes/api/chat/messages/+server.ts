import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { chatWriteBlock } from '$lib/operator-chat-access';
import { OPSGPT_PARTICIPANT_ID } from '$lib/operator-chat-types';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';
import {
  chatRoomMembers,
  getChatRoom,
  postChatMessage,
} from '$lib/server/operator-chat';
import { PUBLIC_ROOM_ID } from '$lib/server/operator-chat-store';

export const POST: RequestHandler = async ({ request, locals }) => {
  const authorId = locals.operatorKey?.trim();
  if (!authorId) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  const settings = await ensureAppLocalSettings();
  const account = settings.getOperatorAccount(authorId);
  if (!account || account.disabled) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  let payload: { roomId?: unknown; body?: unknown; mentionOpsgpt?: unknown };
  try {
    payload = (await request.json()) as { roomId?: unknown; body?: unknown; mentionOpsgpt?: unknown };
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'JSON body required'), { status: 400 });
  }
  const roomId = typeof payload.roomId === 'string' ? payload.roomId : '';
  const room = roomId === PUBLIC_ROOM_ID ? { id: PUBLIC_ROOM_ID, kind: 'public' as const } : getChatRoom(roomId);
  if (!room) {
    return json(createErrorResponse(ErrorCode.NOT_FOUND, 'room not found'), { status: 404 });
  }
  const memberIds = chatRoomMembers(room.id);
  const counterpart = memberIds.find((m) => m !== authorId && m !== OPSGPT_PARTICIPANT_ID);
  const counterpartAccount = counterpart ? settings.getOperatorAccount(counterpart) : null;
  const counterpartDisabled = Boolean(counterpart && (!counterpartAccount || counterpartAccount.disabled));
  const blocked = chatWriteBlock({
    kind: room.kind,
    username: authorId,
    memberIds,
    role: account.role,
    counterpartDisabled,
  });
  if (blocked === 'FORBIDDEN') {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'not a member of this room'), { status: 403 });
  }
  if (blocked === 'DISABLED') {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'counterpart is disabled'), { status: 403 });
  }
  if (blocked === 'VIEWER') {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Viewer cannot send in an OPSGPT DM'), {
      status: 403,
    });
  }
  const body = typeof payload.body === 'string' ? payload.body : '';
  const posted = postChatMessage({
    authorId,
    roomId: room.id,
    body,
    role: account.role,
    mentionChip: payload.mentionOpsgpt === true,
    counterpartDisabled,
  });
  if (!posted.ok) {
    if (posted.code === 'RATE_LIMITED' || posted.code === 'PENDING') {
      return json(createErrorResponse(ErrorCode.RATE_LIMITED, posted.error), { status: 429 });
    }
    if (posted.code === 'NOT_FOUND') {
      return json(createErrorResponse(ErrorCode.NOT_FOUND, posted.error), { status: 404 });
    }
    if (posted.code === 'FORBIDDEN' || posted.code === 'VIEWER' || posted.code === 'DISABLED') {
      return json(createErrorResponse(ErrorCode.UNAUTHORIZED, posted.error), { status: 403 });
    }
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, posted.error), { status: 400 });
  }
  return json({ message: posted.message, aiMessage: posted.aiMessage ?? null });
};
