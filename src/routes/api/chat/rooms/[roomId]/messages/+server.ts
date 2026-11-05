import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { chatCanReadRoom } from '$lib/operator-chat-access';
import {
  chatRoomMembers,
  getChatRoom,
  listRoomMessages,
} from '$lib/server/operator-chat';
import { PUBLIC_ROOM_ID } from '$lib/server/operator-chat-store';

export const GET: RequestHandler = async ({ params, url, locals }) => {
  if (!locals.operatorKey) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  const roomId = params.roomId;
  const room = roomId === PUBLIC_ROOM_ID ? { id: PUBLIC_ROOM_ID, kind: 'public' as const } : getChatRoom(roomId);
  if (!room) {
    return json(createErrorResponse(ErrorCode.NOT_FOUND, 'room not found'), { status: 404 });
  }
  const memberIds = chatRoomMembers(room.id);
  if (!chatCanReadRoom({ kind: room.kind, username: locals.operatorKey, memberIds })) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'not a member of this room'), { status: 403 });
  }
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;
  const page = listRoomMessages({
    roomId: room.id,
    cursor,
    limit: limit !== undefined && !Number.isNaN(limit) ? limit : undefined,
  });
  return json(page);
};
