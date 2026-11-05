import { base } from '$app/paths';
import type { ChatMessage, ChatStreamEvent } from '$lib/operator-chat-types';

export function connectChatStream(handlers: {
  onHello?: () => void;
  onMessage: (message: ChatMessage) => void;
  onMessageUpdated?: (message: ChatMessage) => void;
  onError?: (err: Event) => void;
}): () => void {
  const prefix = base.replace(/\/+$/, '');
  const eventSource = new EventSource(`${prefix}/api/chat/stream`);

  eventSource.onmessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as ChatStreamEvent;
      if (data.type === 'hello') handlers.onHello?.();
      else if (data.type === 'message') handlers.onMessage(data.message);
      else if (data.type === 'message_updated') handlers.onMessageUpdated?.(data.message);
    } catch {
      /* ignore malformed */
    }
  };

  eventSource.onerror = (err: Event) => {
    handlers.onError?.(err);
  };

  return () => {
    eventSource.close();
  };
}
