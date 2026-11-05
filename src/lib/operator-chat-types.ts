export const PUBLIC_ROOM_ID = 'public';
export const OPSGPT_PARTICIPANT_ID = 'participant:opsgpt';
export const OPSGPT_DISPLAY_NAME = 'OPSGPT';

export type ChatMessageStatus = 'complete' | 'pending' | 'error';
export type ChatRoomKind = 'public' | 'operator_dm' | 'opsgpt_dm';

export type ChatAssistantImages = {
  images: Array<{ url: string }>;
  truncated: boolean;
} | null;

export type ChatMessage = {
  id: string;
  roomId: string;
  authorId: string;
  body: string;
  status: ChatMessageStatus;
  orchestratorTurnId: string | null;
  assistantImages: ChatAssistantImages;
  createdAt: string;
};

export type ChatRoomSummary = {
  id: string;
  kind: ChatRoomKind;
  title: string;
  unread: boolean;
};

export type ChatRosterEntry = {
  id: string;
  displayName: string;
  kind: 'operator' | 'opsgpt';
  role?: 'platform_owner' | 'operator' | 'viewer';
};

export type ChatMessagePage = {
  messages: ChatMessage[];
  cursor: string | null;
};

export type ChatStreamEvent =
  | { type: 'hello'; ts: string }
  | { type: 'message'; message: ChatMessage }
  | { type: 'message_updated'; message: ChatMessage }
  | { type: 'heartbeat'; ts: string };

export type ChatRoomUnread = {
  roomId: string;
  unread: boolean;
};

export type ChatUnreadSummary = {
  unreadRoomCount: number;
  rooms: ChatRoomUnread[];
};
