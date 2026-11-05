import { chatShouldInvokeOpsgpt, chatWriteBlock } from '../operator-chat-access.ts';
import { parsePublicOpsgptInvoke } from '../operator-chat-body.ts';
import type { OperatorRole } from '../operator-role.ts';
import {
  OPSGPT_PARTICIPANT_ID,
  PUBLIC_ROOM_ID,
  type ChatMessage,
  type ChatMessagePage,
  type ChatRoomSummary,
  type ChatUnreadSummary,
} from '../operator-chat-types.ts';
import { consumeChatAiTurn, consumeHumanChatRate, releaseChatAiTurn } from './operator-chat-rate.ts';
import { broadcastChatEvent, startChatPruneInterval } from './operator-chat-hub.ts';
import {
  runChatOrchestratorTurn,
  wallDiagnosisAnswer,
} from './operator-chat-orchestrator.ts';
import {
  MESSAGE_BODY_MAX,
  getOperatorChatStore,
  type ChatRoomRecord,
  type OpenDmResult,
} from './operator-chat-store.ts';

export type PostChatResult =
  | {
      ok: true;
      message: ChatMessage;
      aiMessage?: ChatMessage;
    }
  | {
      ok: false;
      code: 'BAD_REQUEST' | 'NOT_FOUND' | 'RATE_LIMITED' | 'PENDING' | 'FORBIDDEN' | 'DISABLED' | 'VIEWER';
      error: string;
    };

export type PostPublicResult =
  | PostChatResult
  | { ok: false; code: 'RATE_LIMITED'; error: string };

function emitMessage(message: ChatMessage): void {
  const to = getOperatorChatStore().broadcastAudience(message.roomId);
  broadcastChatEvent({ type: 'message', message }, { to });
}

function emitUpdated(message: ChatMessage): void {
  const to = getOperatorChatStore().broadcastAudience(message.roomId);
  broadcastChatEvent({ type: 'message_updated', message }, { to });
}

const aiJobs = new Set<Promise<void>>();

function trackAi(job: Promise<void>): void {
  aiJobs.add(job);
  void job.finally(() => {
    aiJobs.delete(job);
  });
}

/** Test helper: wait for in-flight Operator Chat OPSGPT turns. */
export async function _awaitChatAiForTests(): Promise<void> {
  await Promise.all([...aiJobs]);
}

export function ensureOperatorChatRuntime(): void {
  const store = getOperatorChatStore();
  startChatPruneInterval(() => {
    store.pruneExpired();
  });
}

export function listPublicMessages(opts?: {
  limit?: number;
  cursor?: string;
}): ChatMessagePage {
  ensureOperatorChatRuntime();
  return getOperatorChatStore().listMessages({
    roomId: PUBLIC_ROOM_ID,
    limit: opts?.limit,
    cursor: opts?.cursor,
  });
}

export function listRoomMessages(opts: {
  roomId: string;
  limit?: number;
  cursor?: string;
}): ChatMessagePage {
  ensureOperatorChatRuntime();
  return getOperatorChatStore().listMessages({
    roomId: opts.roomId,
    limit: opts.limit,
    cursor: opts.cursor,
  });
}

export function getChatRoom(roomId: string): ChatRoomRecord | null {
  ensureOperatorChatRuntime();
  return getOperatorChatStore().getRoom(roomId);
}

export function chatRoomMembers(roomId: string): string[] {
  ensureOperatorChatRuntime();
  return getOperatorChatStore().roomMembers(roomId);
}

export function listChatRooms(username: string): ChatRoomSummary[] {
  ensureOperatorChatRuntime();
  return getOperatorChatStore().listRoomsFor(username);
}

export function openOperatorDm(a: string, b: string): OpenDmResult {
  ensureOperatorChatRuntime();
  return getOperatorChatStore().getOrCreateOperatorDm(a, b);
}

export function openOpsgptDm(username: string): OpenDmResult {
  ensureOperatorChatRuntime();
  return getOperatorChatStore().getOrCreateOpsgptDm(username);
}

export function postPublicHumanMessage(opts: {
  authorId: string;
  body: string;
  now?: Date;
  role?: OperatorRole;
  mentionChip?: boolean;
}): PostPublicResult {
  return postChatMessage({
    authorId: opts.authorId,
    roomId: PUBLIC_ROOM_ID,
    body: opts.body,
    now: opts.now,
    role: opts.role,
    mentionChip: opts.mentionChip,
    counterpartDisabled: false,
  });
}

export function postChatMessage(opts: {
  authorId: string;
  roomId: string;
  body: string;
  now?: Date;
  role?: OperatorRole | null;
  mentionChip?: boolean;
  counterpartDisabled?: boolean;
}): PostChatResult {
  ensureOperatorChatRuntime();
  const authorId = opts.authorId.trim();
  const body = opts.body;
  if (!authorId) {
    return { ok: false, code: 'BAD_REQUEST', error: 'author is required' };
  }
  if (typeof body !== 'string' || body.trim().length === 0) {
    return { ok: false, code: 'BAD_REQUEST', error: 'body is required' };
  }
  if (body.length > MESSAGE_BODY_MAX) {
    return { ok: false, code: 'BAD_REQUEST', error: `body exceeds ${MESSAGE_BODY_MAX} characters` };
  }
  const store = getOperatorChatStore();
  const room = store.getRoom(opts.roomId);
  if (!room) {
    return { ok: false, code: 'NOT_FOUND', error: 'room not found' };
  }
  const memberIds = store.roomMembers(opts.roomId);
  const blocked = chatWriteBlock({
    kind: room.kind,
    username: authorId,
    memberIds,
    role: opts.role,
    counterpartDisabled: opts.counterpartDisabled === true,
  });
  if (blocked === 'FORBIDDEN') {
    return { ok: false, code: 'FORBIDDEN', error: 'not a member of this room' };
  }
  if (blocked === 'DISABLED') {
    return { ok: false, code: 'DISABLED', error: 'counterpart is disabled' };
  }
  if (blocked === 'VIEWER') {
    return { ok: false, code: 'VIEWER', error: 'Viewer cannot send in an OPSGPT DM' };
  }

  const invoke = chatShouldInvokeOpsgpt({
    kind: room.kind,
    role: opts.role,
    body,
    mentionChip: opts.mentionChip,
  });
  const nowMs = (opts.now ?? new Date()).getTime();
  if (invoke) {
    const ai = consumeChatAiTurn(authorId, nowMs);
    if (!ai.ok) {
      return {
        ok: false,
        code: ai.code,
        error: ai.code === 'PENDING' ? 'OPSGPT turn already in progress' : 'Too many OPSGPT turns',
      };
    }
  }
  if (!consumeHumanChatRate(authorId, nowMs)) {
    if (invoke) releaseChatAiTurn(authorId);
    return { ok: false, code: 'RATE_LIMITED', error: 'Too many messages' };
  }

  const posted = store.postHumanMessage({
    roomId: opts.roomId,
    authorId,
    body,
    now: opts.now,
  });
  if (!posted.ok) {
    if (invoke) releaseChatAiTurn(authorId);
    return posted;
  }
  emitMessage(posted.message);

  if (!invoke) {
    return { ok: true, message: posted.message };
  }

  const parsed = parsePublicOpsgptInvoke(body, opts.mentionChip === true);
  const query = room.kind === 'opsgpt_dm' ? body.trim() : parsed.query;
  const persistConversation = room.kind === 'opsgpt_dm';
  const priorConversationId = persistConversation ? store.getOpsgptConversationId(authorId) ?? '' : '';
  const pending = store.postOpsgptMessage({
    roomId: opts.roomId,
    body: '',
    status: 'pending',
    now: opts.now ? new Date(opts.now.getTime() + 1) : undefined,
  });
  store.markRead({
    roomId: opts.roomId,
    username: authorId,
    messageId: pending.id,
    createdAt: pending.createdAt,
    now: opts.now,
  });
  emitMessage(pending);

  trackAi(finishOpsgptTurn({
    authorId,
    pendingId: pending.id,
    query,
    conversationId: priorConversationId,
    persistConversation,
  }));

  return { ok: true, message: posted.message, aiMessage: pending };
}

async function finishOpsgptTurn(opts: {
  authorId: string;
  pendingId: string;
  query: string;
  conversationId: string;
  persistConversation: boolean;
}): Promise<void> {
  try {
    const result = await runChatOrchestratorTurn({
      query: opts.query,
      conversationId: opts.conversationId,
      operatorUsername: opts.authorId,
    });
    const store = getOperatorChatStore();
    if (opts.persistConversation && result.conversationId) {
      store.setOpsgptConversationId(opts.authorId, result.conversationId);
    }
    const wall = result.error
      ? result.error
      : wallDiagnosisAnswer(result.answer) || 'OPSGPT 本回合沒有可顯示的答案';
    const updated = store.updateMessage({
      id: opts.pendingId,
      body: wall,
      status: result.error ? 'error' : 'complete',
      orchestratorTurnId: result.conversationId || null,
    });
    if (updated) emitUpdated(updated);
  } finally {
    releaseChatAiTurn(opts.authorId);
  }
}

export function getChatUnreadSummary(username: string): ChatUnreadSummary {
  ensureOperatorChatRuntime();
  return getOperatorChatStore().unreadSummary(username);
}

export function markRoomRead(
  username: string,
  roomId: string,
  message?: { messageId: string; createdAt: string },
): void {
  ensureOperatorChatRuntime();
  const store = getOperatorChatStore();
  const target = message
    ? { id: message.messageId, createdAt: message.createdAt }
    : store.listMessages({ roomId, limit: 1 }).messages.at(-1);
  if (!target) return;
  store.markRead({
    roomId,
    username,
    messageId: target.id,
    createdAt: target.createdAt,
  });
}

export function markPublicRoomRead(
  username: string,
  message?: { messageId: string; createdAt: string },
): void {
  markRoomRead(username, PUBLIC_ROOM_ID, message);
}

export { OPSGPT_PARTICIPANT_ID, PUBLIC_ROOM_ID };
export type { ChatMessage, ChatMessagePage, ChatRoomSummary, ChatUnreadSummary };
