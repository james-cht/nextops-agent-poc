import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  ChatAssistantImages,
  ChatMessage,
  ChatMessagePage,
  ChatMessageStatus,
  ChatRoomKind,
  ChatRoomSummary,
  ChatUnreadSummary,
} from '../operator-chat-types.ts';
import { OPSGPT_DISPLAY_NAME, OPSGPT_PARTICIPANT_ID, PUBLIC_ROOM_ID } from '../operator-chat-types.ts';

export type { ChatMessage, ChatMessagePage, ChatMessageStatus, ChatRoomKind, ChatRoomSummary, ChatUnreadSummary };
export { PUBLIC_ROOM_ID, OPSGPT_PARTICIPANT_ID, OPSGPT_DISPLAY_NAME } from '../operator-chat-types.ts';
export const MESSAGE_BODY_MAX = 4000;
export const MESSAGE_PAGE_DEFAULT = 50;
export const MESSAGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type PostHumanResult =
  | { ok: true; message: ChatMessage }
  | { ok: false; code: 'BAD_REQUEST' | 'NOT_FOUND'; error: string };

export type OpenDmResult =
  | { ok: true; roomId: string }
  | { ok: false; code: 'BAD_REQUEST'; error: string };

export type ChatRoomRecord = {
  id: string;
  kind: ChatRoomKind;
};

export type OperatorChatStore = {
  close(): void;
  postHumanMessage(opts: {
    roomId: string;
    authorId: string;
    body: string;
    now?: Date;
  }): PostHumanResult;
  postOpsgptMessage(opts: {
    roomId: string;
    body: string;
    status: ChatMessageStatus;
    orchestratorTurnId?: string | null;
    assistantImages?: ChatAssistantImages;
    now?: Date;
  }): ChatMessage;
  updateMessage(opts: {
    id: string;
    body: string;
    status: ChatMessageStatus;
    orchestratorTurnId?: string | null;
    assistantImages?: ChatAssistantImages;
  }): ChatMessage | null;
  listMessages(opts: {
    roomId: string;
    limit?: number;
    cursor?: string;
    now?: Date;
  }): ChatMessagePage;
  pruneExpired(now?: Date): number;
  markRead(opts: {
    roomId: string;
    username: string;
    messageId: string;
    createdAt: string;
    now?: Date;
  }): void;
  unreadSummary(username: string, now?: Date): ChatUnreadSummary;
  getRoom(roomId: string): ChatRoomRecord | null;
  roomMembers(roomId: string): string[];
  listRoomsFor(username: string, now?: Date): ChatRoomSummary[];
  getOrCreateOperatorDm(a: string, b: string, now?: Date): OpenDmResult;
  getOrCreateOpsgptDm(username: string, now?: Date): OpenDmResult;
  broadcastAudience(roomId: string): 'all' | string[];
  getOpsgptConversationId(username: string): string | null;
  setOpsgptConversationId(username: string, conversationId: string, now?: Date): void;
};

type MessageRow = {
  id: string;
  room_id: string;
  author_id: string;
  body: string;
  status: string;
  orchestrator_turn_id: string | null;
  assistant_images: string | null;
  created_at: string;
};

function iso(d: Date): string {
  return d.toISOString();
}

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}\t${id}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const tab = raw.indexOf('\t');
    if (tab <= 0) return null;
    const createdAt = raw.slice(0, tab);
    const id = raw.slice(tab + 1);
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function isAfter(
  candidate: { createdAt: string; id: string },
  cursor: { createdAt: string; id: string },
): boolean {
  if (candidate.createdAt > cursor.createdAt) return true;
  if (candidate.createdAt < cursor.createdAt) return false;
  return candidate.id > cursor.id;
}

function parseAssistantImages(raw: string | null): ChatAssistantImages {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ChatAssistantImages;
    if (!parsed || !Array.isArray(parsed.images)) return null;
    return {
      images: parsed.images.filter((img) => img && typeof img.url === 'string').map((img) => ({ url: img.url })),
      truncated: Boolean(parsed.truncated),
    };
  } catch {
    return null;
  }
}

function rowToMessage(row: MessageRow): ChatMessage {
  const status = row.status;
  const okStatus: ChatMessageStatus =
    status === 'pending' || status === 'error' ? status : 'complete';
  return {
    id: row.id,
    roomId: row.room_id,
    authorId: row.author_id,
    body: row.body,
    status: okStatus,
    orchestratorTurnId: row.orchestrator_turn_id,
    assistantImages: parseAssistantImages(row.assistant_images),
    createdAt: row.created_at,
  };
}

function asRoomKind(kind: string): ChatRoomKind {
  if (kind === 'operator_dm' || kind === 'opsgpt_dm') return kind;
  return 'public';
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_room (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('public', 'operator_dm', 'opsgpt_dm')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_message (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('complete', 'pending', 'error')),
      orchestrator_turn_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chat_message_room_created
      ON chat_message (room_id, created_at, id);
    CREATE TABLE IF NOT EXISTS chat_last_read (
      room_id TEXT NOT NULL,
      username TEXT NOT NULL,
      message_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY (room_id, username)
    );
    CREATE TABLE IF NOT EXISTS chat_room_member (
      room_id TEXT NOT NULL,
      username TEXT NOT NULL,
      PRIMARY KEY (room_id, username)
    );
    CREATE TABLE IF NOT EXISTS chat_opsgpt_conversation (
      username TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const cols = db.prepare(`PRAGMA table_info(chat_message)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === 'assistant_images')) {
    db.exec(`ALTER TABLE chat_message ADD COLUMN assistant_images TEXT`);
  }
}

function ensurePublicRoom(db: DatabaseSync, now: Date): void {
  db.prepare(
    `INSERT OR IGNORE INTO chat_room (id, kind, created_at) VALUES (?, 'public', ?)`,
  ).run(PUBLIC_ROOM_ID, iso(now));
}

type LastReadRow = { message_id: string; created_at: string };

function readLastRead(
  db: DatabaseSync,
  roomId: string,
  username: string,
): LastReadRow | null {
  const row = db
    .prepare(
      'SELECT message_id, created_at FROM chat_last_read WHERE room_id = ? AND username = ?',
    )
    .get(roomId, username) as LastReadRow | undefined;
  return row ?? null;
}

function writeLastRead(
  db: DatabaseSync,
  opts: {
    roomId: string;
    username: string;
    messageId: string;
    createdAt: string;
    now: Date;
  },
): void {
  const existing = readLastRead(db, opts.roomId, opts.username);
  if (
    existing &&
    !isAfter(
      { createdAt: opts.createdAt, id: opts.messageId },
      { createdAt: existing.created_at, id: existing.message_id },
    )
  ) {
    return;
  }
  db.prepare(
    `INSERT INTO chat_last_read (room_id, username, message_id, created_at, read_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(room_id, username) DO UPDATE SET
       message_id = excluded.message_id,
       created_at = excluded.created_at,
       read_at = excluded.read_at`,
  ).run(opts.roomId, opts.username, opts.messageId, opts.createdAt, iso(opts.now));
}

function roomHasUnread(
  db: DatabaseSync,
  opts: { roomId: string; username: string; cutoff: string },
): boolean {
  const last = readLastRead(db, opts.roomId, opts.username);
  if (!last) {
    const row = db
      .prepare(
        `SELECT 1 AS n FROM chat_message
         WHERE room_id = ? AND created_at >= ? AND author_id != ?
         LIMIT 1`,
      )
      .get(opts.roomId, opts.cutoff, opts.username) as { n: number } | undefined;
    return Boolean(row);
  }
  const row = db
    .prepare(
      `SELECT 1 AS n FROM chat_message
       WHERE room_id = ?
         AND created_at >= ?
         AND (created_at > ? OR (created_at = ? AND id > ?))
       LIMIT 1`,
    )
    .get(opts.roomId, opts.cutoff, last.created_at, last.created_at, last.message_id) as
      | { n: number }
      | undefined;
  return Boolean(row);
}

function membersOf(db: DatabaseSync, roomId: string): string[] {
  const rows = db
    .prepare('SELECT username FROM chat_room_member WHERE room_id = ? ORDER BY username')
    .all(roomId) as { username: string }[];
  return rows.map((r) => r.username);
}

function getRoomRow(db: DatabaseSync, roomId: string): ChatRoomRecord | null {
  const row = db.prepare('SELECT id, kind FROM chat_room WHERE id = ?').get(roomId) as
    | { id: string; kind: string }
    | undefined;
  if (!row) return null;
  return { id: row.id, kind: asRoomKind(row.kind) };
}

function roomTitle(kind: ChatRoomKind, username: string, memberIds: string[]): string {
  if (kind === 'public') return '公共';
  if (kind === 'opsgpt_dm') return OPSGPT_DISPLAY_NAME;
  const other = memberIds.find((m) => m !== username);
  return other ?? 'DM';
}

function visibleRooms(db: DatabaseSync, username: string): ChatRoomRecord[] {
  const who = username.trim();
  const publicRoom = getRoomRow(db, PUBLIC_ROOM_ID);
  const rooms: ChatRoomRecord[] = publicRoom ? [publicRoom] : [];
  if (!who) return rooms;
  const rows = db
    .prepare(
      `SELECT r.id, r.kind
       FROM chat_room r
       JOIN chat_room_member m ON m.room_id = r.id
       WHERE m.username = ? AND r.kind != 'public'
       ORDER BY r.created_at DESC, r.id DESC`,
    )
    .all(who) as { id: string; kind: string }[];
  for (const row of rows) rooms.push({ id: row.id, kind: asRoomKind(row.kind) });
  return rooms;
}

function insertRoom(
  db: DatabaseSync,
  opts: { id: string; kind: ChatRoomKind; members: string[]; now: Date },
): void {
  db.prepare(`INSERT INTO chat_room (id, kind, created_at) VALUES (?, ?, ?)`).run(
    opts.id,
    opts.kind,
    iso(opts.now),
  );
  const insertMember = db.prepare(
    `INSERT INTO chat_room_member (room_id, username) VALUES (?, ?)`,
  );
  for (const member of opts.members) {
    insertMember.run(opts.id, member);
  }
}

function findOperatorDm(db: DatabaseSync, a: string, b: string): string | null {
  const row = db
    .prepare(
      `SELECT r.id AS id
       FROM chat_room r
       WHERE r.kind = 'operator_dm'
         AND (SELECT COUNT(*) FROM chat_room_member WHERE room_id = r.id) = 2
         AND EXISTS (SELECT 1 FROM chat_room_member WHERE room_id = r.id AND username = ?)
         AND EXISTS (SELECT 1 FROM chat_room_member WHERE room_id = r.id AND username = ?)`,
    )
    .get(a, b) as { id: string } | undefined;
  return row?.id ?? null;
}

function findOpsgptDm(db: DatabaseSync, username: string): string | null {
  const row = db
    .prepare(
      `SELECT r.id AS id
       FROM chat_room r
       WHERE r.kind = 'opsgpt_dm'
         AND EXISTS (SELECT 1 FROM chat_room_member WHERE room_id = r.id AND username = ?)
         AND EXISTS (SELECT 1 FROM chat_room_member WHERE room_id = r.id AND username = ?)`,
    )
    .get(username, OPSGPT_PARTICIPANT_ID) as { id: string } | undefined;
  return row?.id ?? null;
}

export function openOperatorChatStore(dbPath: string): OperatorChatStore {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  migrate(db);
  ensurePublicRoom(db, new Date());

  const store: OperatorChatStore = {
    close() {
      db.close();
    },

    postHumanMessage(opts) {
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
      const room = getRoomRow(db, opts.roomId);
      if (!room) {
        return { ok: false, code: 'NOT_FOUND', error: 'room not found' };
      }
      const now = opts.now ?? new Date();
      const message: ChatMessage = {
        id: randomUUID(),
        roomId: opts.roomId,
        authorId,
        body,
        status: 'complete',
        orchestratorTurnId: null,
        assistantImages: null,
        createdAt: iso(now),
      };
      db.prepare(
        `INSERT INTO chat_message
           (id, room_id, author_id, body, status, orchestrator_turn_id, assistant_images, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        message.id,
        message.roomId,
        message.authorId,
        message.body,
        message.status,
        message.orchestratorTurnId,
        null,
        message.createdAt,
      );
      writeLastRead(db, {
        roomId: message.roomId,
        username: authorId,
        messageId: message.id,
        createdAt: message.createdAt,
        now,
      });
      return { ok: true, message };
    },

    postOpsgptMessage(opts) {
      const now = opts.now ?? new Date();
      const message: ChatMessage = {
        id: randomUUID(),
        roomId: opts.roomId,
        authorId: OPSGPT_PARTICIPANT_ID,
        body: opts.body,
        status: opts.status,
        orchestratorTurnId: opts.orchestratorTurnId ?? null,
        assistantImages: opts.assistantImages ?? null,
        createdAt: iso(now),
      };
      db.prepare(
        `INSERT INTO chat_message
           (id, room_id, author_id, body, status, orchestrator_turn_id, assistant_images, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        message.id,
        message.roomId,
        message.authorId,
        message.body,
        message.status,
        message.orchestratorTurnId,
        message.assistantImages ? JSON.stringify(message.assistantImages) : null,
        message.createdAt,
      );
      return message;
    },

    updateMessage(opts) {
      const existing = db
        .prepare(
          `SELECT id, room_id, author_id, body, status, orchestrator_turn_id, assistant_images, created_at
           FROM chat_message WHERE id = ?`,
        )
        .get(opts.id) as MessageRow | undefined;
      if (!existing) return null;
      const assistantImages = opts.assistantImages ?? parseAssistantImages(existing.assistant_images);
      db.prepare(
        `UPDATE chat_message
         SET body = ?, status = ?, orchestrator_turn_id = ?, assistant_images = ?
         WHERE id = ?`,
      ).run(
        opts.body,
        opts.status,
        opts.orchestratorTurnId ?? existing.orchestrator_turn_id,
        assistantImages ? JSON.stringify(assistantImages) : null,
        opts.id,
      );
      return {
        ...rowToMessage(existing),
        body: opts.body,
        status: opts.status,
        orchestratorTurnId: opts.orchestratorTurnId ?? existing.orchestrator_turn_id,
        assistantImages,
      };
    },

    listMessages(opts) {
      const now = opts.now ?? new Date();
      const cutoff = iso(new Date(now.getTime() - MESSAGE_RETENTION_MS));
      const limitRaw = opts.limit ?? MESSAGE_PAGE_DEFAULT;
      const limit = Math.max(1, Math.min(200, limitRaw));
      const decoded = opts.cursor ? decodeCursor(opts.cursor) : null;

      let rows: MessageRow[];
      if (decoded) {
        rows = db
          .prepare(
            `SELECT id, room_id, author_id, body, status, orchestrator_turn_id, assistant_images, created_at
             FROM chat_message
             WHERE room_id = ?
               AND created_at >= ?
               AND (created_at < ? OR (created_at = ? AND id < ?))
             ORDER BY created_at DESC, id DESC
             LIMIT ?`,
          )
          .all(opts.roomId, cutoff, decoded.createdAt, decoded.createdAt, decoded.id, limit) as MessageRow[];
      } else {
        rows = db
          .prepare(
            `SELECT id, room_id, author_id, body, status, orchestrator_turn_id, assistant_images, created_at
             FROM chat_message
             WHERE room_id = ?
               AND created_at >= ?
             ORDER BY created_at DESC, id DESC
             LIMIT ?`,
          )
          .all(opts.roomId, cutoff, limit) as MessageRow[];
      }

      const chronological = rows.slice().reverse().map(rowToMessage);
      const oldest = chronological[0];
      const cursor =
        rows.length === limit && oldest ? encodeCursor(oldest.createdAt, oldest.id) : null;
      return { messages: chronological, cursor };
    },

    pruneExpired(now = new Date()) {
      const cutoff = iso(new Date(now.getTime() - MESSAGE_RETENTION_MS));
      const result = db.prepare('DELETE FROM chat_message WHERE created_at < ?').run(cutoff);
      return Number(result.changes ?? 0);
    },

    markRead(opts) {
      const username = opts.username.trim();
      if (!username) return;
      const room = getRoomRow(db, opts.roomId);
      if (!room) return;
      writeLastRead(db, {
        roomId: opts.roomId,
        username,
        messageId: opts.messageId,
        createdAt: opts.createdAt,
        now: opts.now ?? new Date(),
      });
    },

    unreadSummary(username, now = new Date()) {
      const who = username.trim();
      const cutoff = iso(new Date(now.getTime() - MESSAGE_RETENTION_MS));
      const listed = visibleRooms(db, who).map((r) => ({
        roomId: r.id,
        unread: who ? roomHasUnread(db, { roomId: r.id, username: who, cutoff }) : false,
      }));
      return {
        unreadRoomCount: listed.filter((r) => r.unread).length,
        rooms: listed,
      };
    },

    getRoom(roomId) {
      return getRoomRow(db, roomId);
    },

    roomMembers(roomId) {
      return membersOf(db, roomId);
    },

    listRoomsFor(username, now = new Date()) {
      const who = username.trim();
      const cutoff = iso(new Date(now.getTime() - MESSAGE_RETENTION_MS));
      return visibleRooms(db, who).map((room) => {
        const memberIds = membersOf(db, room.id);
        return {
          id: room.id,
          kind: room.kind,
          title: roomTitle(room.kind, who, memberIds),
          unread: who ? roomHasUnread(db, { roomId: room.id, username: who, cutoff }) : false,
        };
      });
    },

    getOrCreateOperatorDm(a, b, now = new Date()) {
      const left = a.trim();
      const right = b.trim();
      if (!left || !right) {
        return { ok: false, code: 'BAD_REQUEST', error: 'counterpart is required' };
      }
      if (left === right) {
        return { ok: false, code: 'BAD_REQUEST', error: 'cannot DM yourself' };
      }
      const existing = findOperatorDm(db, left, right);
      if (existing) return { ok: true, roomId: existing };
      const id = randomUUID();
      insertRoom(db, { id, kind: 'operator_dm', members: [left, right], now });
      return { ok: true, roomId: id };
    },

    getOrCreateOpsgptDm(username, now = new Date()) {
      const who = username.trim();
      if (!who) {
        return { ok: false, code: 'BAD_REQUEST', error: 'author is required' };
      }
      const existing = findOpsgptDm(db, who);
      if (existing) return { ok: true, roomId: existing };
      const id = randomUUID();
      insertRoom(db, {
        id,
        kind: 'opsgpt_dm',
        members: [who, OPSGPT_PARTICIPANT_ID],
        now,
      });
      return { ok: true, roomId: id };
    },

    broadcastAudience(roomId) {
      const room = getRoomRow(db, roomId);
      if (!room || room.kind === 'public') return 'all';
      return membersOf(db, roomId);
    },

    getOpsgptConversationId(username) {
      const row = db
        .prepare('SELECT conversation_id FROM chat_opsgpt_conversation WHERE username = ?')
        .get(username.trim()) as { conversation_id: string } | undefined;
      return row?.conversation_id ?? null;
    },

    setOpsgptConversationId(username, conversationId, now = new Date()) {
      const who = username.trim();
      const id = conversationId.trim();
      if (!who || !id) return;
      db.prepare(
        `INSERT INTO chat_opsgpt_conversation (username, conversation_id, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(username) DO UPDATE SET
           conversation_id = excluded.conversation_id,
           updated_at = excluded.updated_at`,
      ).run(who, id, iso(now));
    },
  };

  return store;
}

const DEFAULT_DB = path.join(process.cwd(), '.data', 'operator-chat.sqlite');

let singleton: OperatorChatStore | null = null;

/** Process-wide Operator Chat Store; opens and migrates on first use. */
export function getOperatorChatStore(opts?: { dbPath?: string }): OperatorChatStore {
  if (singleton) return singleton;
  singleton = openOperatorChatStore(opts?.dbPath ?? DEFAULT_DB);
  return singleton;
}

/** Test helper: bind the singleton to a temp file. */
export function _openOperatorChatStoreForTests(dbPath: string): OperatorChatStore {
  _resetOperatorChatStoreForTests();
  singleton = openOperatorChatStore(dbPath);
  return singleton;
}

/** Test helper */
export function _resetOperatorChatStoreForTests(): void {
  if (singleton) {
    try {
      singleton.close();
    } catch {
      /* */
    }
  }
  singleton = null;
}
