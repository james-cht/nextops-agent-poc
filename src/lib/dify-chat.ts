/** Browser → NextOps `/api/ai/query` body. */
export type AiQueryClientBody = {
  query: string;
  siteId: string;
  streaming: boolean;
  conversationId?: string;
};

/** NextOps → Dify `/chat-messages` body. */
export type DifyChatMessagesBody = {
  inputs: { site_id: string };
  query: string;
  response_mode: 'streaming' | 'blocking';
  user: string;
  conversation_id: string;
};

export function buildAiQueryClientBody(opts: {
  query: string;
  siteId: string;
  streaming: boolean;
  conversationId?: string;
}): AiQueryClientBody {
  const body: AiQueryClientBody = {
    query: opts.query,
    siteId: opts.siteId,
    streaming: opts.streaming,
  };
  if (opts.conversationId) {
    body.conversationId = opts.conversationId;
  }
  return body;
}

export function buildDifyChatMessagesBody(opts: {
  query: string;
  siteId?: string;
  streaming: boolean;
  conversationId?: string;
  user?: string;
}): DifyChatMessagesBody {
  return {
    inputs: { site_id: opts.siteId ?? '' },
    query: opts.query,
    response_mode: opts.streaming ? 'streaming' : 'blocking',
    user: opts.user ?? 'nextops',
    conversation_id: opts.conversationId ?? '',
  };
}
