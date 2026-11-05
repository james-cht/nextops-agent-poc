import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { chatCanReadRoom } from '$lib/operator-chat-access';
import {
  chatRoomMembers,
  getChatRoom,
  markRoomRead,
} from '$lib/server/operator-chat';
import { PUBLIC_ROOM_ID } from '$lib/server/operator-chat-store';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const username = locals.operatorKey?.trim();
  if (!username) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  const roomId = params.roomId;
  const room = roomId === PUBLIC_ROOM_ID ? { id: PUBLIC_ROOM_ID, kind: 'public' as const } : getChatRoom(roomId);
  if (!room) {
    return json(createErrorResponse(ErrorCode.NOT_FOUND, 'room not found'), { status: 404 });
  }
  const memberIds = chatRoomMembers(room.id);
  if (!chatCanReadRoom({ kind: room.kind, username, memberIds })) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'not a member of this room'), { status: 403 });
  }
  let message: { messageId: string; createdAt: string } | undefined;
  try {
    const payload = (await request.json()) as { messageId?: unknown; createdAt?: unknown };
    if (typeof payload.messageId === 'string' && typeof payload.createdAt === 'string') {
      message = { messageId: payload.messageId, createdAt: payload.createdAt };
    }
  } catch {
    message = undefined;
  }
  markRoomRead(username, room.id, message);
  return json({ ok: true });
};
