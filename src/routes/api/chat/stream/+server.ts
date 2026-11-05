import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import {
  addChatClient,
  encodeChatSse,
} from '$lib/server/operator-chat-hub';
import { ensureOperatorChatRuntime } from '$lib/server/operator-chat';

export const GET: RequestHandler = ({ locals, request }) => {
  if (!locals.operatorKey) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Session required'), { status: 401 });
  }
  ensureOperatorChatRuntime();

  const stream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue(encodeChatSse({ type: 'hello', ts: new Date().toISOString() }));
      const cleanup = addChatClient(controller, locals.operatorKey);
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encodeChatSse({ type: 'heartbeat', ts: new Date().toISOString() }));
        } catch {
          cleanup();
          clearInterval(heartbeat);
        }
      }, 30000);
      request.signal.addEventListener('abort', () => {
        cleanup();
        clearInterval(heartbeat);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};
