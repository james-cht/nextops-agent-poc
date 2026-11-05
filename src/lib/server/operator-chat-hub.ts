import type { ChatStreamEvent } from '../operator-chat-types.ts';

type StreamController = ReadableStreamDefaultController<string>;

type ChatClient = {
  controller: StreamController;
  username: string;
};

const clients = new Set<ChatClient>();

let pruneTimer: ReturnType<typeof setInterval> | null = null;

export function encodeChatSse(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function addChatClient(controller: StreamController, username = ''): () => void {
  const client: ChatClient = { controller, username: username.trim() };
  clients.add(client);
  return () => {
    clients.delete(client);
  };
}

export function broadcastChatEvent(
  event: ChatStreamEvent,
  opts?: { to?: 'all' | Iterable<string> },
): void {
  const data = encodeChatSse(event);
  const audience = opts?.to;
  const allowed =
    audience && audience !== 'all' ? new Set([...audience].map((n) => n.trim()).filter(Boolean)) : null;
  for (const client of clients) {
    if (allowed && !allowed.has(client.username)) continue;
    try {
      client.controller.enqueue(data);
    } catch {
      clients.delete(client);
    }
  }
}

export function chatClientCount(): number {
  return clients.size;
}

/** Test helper */
export function _resetChatHubForTests(): void {
  clients.clear();
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
}

const PRUNE_EVERY_MS = 60 * 60 * 1000;

export function startChatPruneInterval(prune: () => void): void {
  if (pruneTimer) return;
  pruneTimer = setInterval(prune, PRUNE_EVERY_MS);
}

export function stopChatPruneInterval(): void {
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
}
