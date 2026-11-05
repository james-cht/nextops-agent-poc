// Dify SSE streaming client
// Parses Server-Sent Events from /api/ai/query and calls registered callbacks

import { buildAiQueryClientBody } from './dify-chat.ts';

export type DifyStreamCallbacks = {
  onMessage?: (text: string) => void;
  onEnd?: (conversationId: string) => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  onAssistantImages?: (payload: {
    images: Array<{ url: string }>;
    blocked: Array<{ host: string; reason: string }>;
    truncated: boolean;
    textSanitized: string;
  }) => void;
};

export type CreateDifyStreamOptions = {
  query: string;
  siteId: string;
  conversationId?: string;
  callbacks: DifyStreamCallbacks;
  abortSignal?: AbortSignal;
};

export function createDifyStream(opts: CreateDifyStreamOptions): { abort: () => void } {
  const controller = new AbortController();
  const signal = opts.abortSignal || controller.signal;
  const { callbacks } = opts;

  async function start() {
    callbacks.onStatusChange?.('connecting');

    try {
      const response = await fetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildAiQueryClientBody({
            query: opts.query,
            siteId: opts.siteId,
            streaming: true,
            conversationId: opts.conversationId,
          }),
        ),
        signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        callbacks.onError?.(err.error || 'Request failed');
        callbacks.onStatusChange?.('error');
        return;
      }

      callbacks.onStatusChange?.('connected');

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (!part.trim()) continue;
          parseAndHandleEvent(part, callbacks);
        }
      }

      callbacks.onStatusChange?.('disconnected');
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        callbacks.onError?.(err.message || 'Connection failed');
        callbacks.onStatusChange?.('error');
      }
    }
  }

  start();

  return {
    abort: () => controller.abort(),
  };
}

function parseAndHandleEvent(block: string, callbacks: DifyStreamCallbacks) {
  const lines = block.split('\n');
  let eventType = '';
  let dataStr = '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      dataStr = line.slice(6);
    }
  }

  if (!eventType || !dataStr) return;

  let data: unknown;
  try {
    data = JSON.parse(dataStr);
  } catch {
    return;
  }

  switch (eventType) {
    case 'message':
    case 'agent_message': {
      const d = data as { answer?: string };
      if (d.answer) callbacks.onMessage?.(d.answer);
      break;
    }
    case 'message_end': {
      const d = data as { conversation_id?: string };
      callbacks.onEnd?.(d.conversation_id || '');
      break;
    }
    case 'assistant_images': {
      const d = data as {
        images?: Array<{ url: string }>;
        blocked?: Array<{ host: string; reason: string }>;
        truncated?: boolean;
        textSanitized?: string;
      };
      callbacks.onAssistantImages?.({
        images: d.images ?? [],
        blocked: d.blocked ?? [],
        truncated: Boolean(d.truncated),
        textSanitized: d.textSanitized ?? '',
      });
      break;
    }
    case 'error': {
      const d = data as { message?: string };
      callbacks.onError?.(d.message || 'Dify error');
      callbacks.onStatusChange?.('error');
      break;
    }
  }
}
