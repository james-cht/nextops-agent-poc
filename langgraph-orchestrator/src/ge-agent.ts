export type GeAgentChatOpts = {
  projectId: string;
  location: string;
  engineId: string;
  agentId: string;
  message: string;
  timeoutMs: number;
  accessToken?: string;
  fetchImpl?: typeof fetch;
};

export type GeAgentChatResult = {
  ok: boolean;
  status: number;
  content: string;
  rawText: string;
};

export function geAgentStreamAssistUrl(projectId: string, location: string, engineId: string): string {
  const host =
    location === 'global' ? 'https://discoveryengine.googleapis.com' : `https://${location}-discoveryengine.googleapis.com`;
  return `${host}/v1alpha/projects/${projectId}/locations/${location}/collections/default_collection/engines/${engineId}/assistants/default_assistant:streamAssist`;
}

export async function geAgentChat(opts: GeAgentChatOpts): Promise<GeAgentChatResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const token = opts.accessToken ?? (await resolveGeAgentAccessToken());
  const url = geAgentStreamAssistUrl(opts.projectId, opts.location, opts.engineId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-goog-user-project': opts.projectId,
      },
      body: JSON.stringify({
        query: { text: opts.message },
        agentsSpec: { agentSpecs: [{ agentId: opts.agentId }] },
      }),
      signal: controller.signal,
    });
    const rawText = await res.text();
    return { ok: res.ok, status: res.status, content: extractGeAgentText(rawText), rawText };
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveGeAgentAccessToken(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const fromEnv = env.GE_AGENT_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token ?? '';
}

type AssistReply = {
  text?: string;
  groundedContent?: { content?: { text?: string } };
};

type AssistEvent = {
  answer?: {
    state?: string;
    replies?: AssistReply[];
  };
};

export function extractGeAgentText(rawText: string): string {
  const events = parseAssistEvents(rawText);
  const succeeded = events.filter((event) => event.answer?.state === 'SUCCEEDED');
  const chosen = succeeded.length ? succeeded : events.filter((event) => event.answer?.replies?.length);
  const text = replyText(chosen[chosen.length - 1]);
  if (text) return text;
  return rawText;
}

function replyText(event: AssistEvent | undefined): string {
  const parts = event?.answer?.replies?.map((reply) => reply.groundedContent?.content?.text || reply.text || '') ?? [];
  return parts.join('');
}

function parseAssistEvents(rawText: string): AssistEvent[] {
  const events: AssistEvent[] = [];
  const trimmed = rawText.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as AssistEvent[];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through to line parsing */
    }
  }
  for (const line of rawText.split(/\r?\n/)) {
    const lineTrimmed = line.trim().replace(/,$/, '');
    if (!lineTrimmed || lineTrimmed === '[' || lineTrimmed === ']' || lineTrimmed.startsWith(':')) continue;
    const payload = lineTrimmed.startsWith('data:') ? lineTrimmed.slice(5).trim() : lineTrimmed;
    if (!payload || payload === '[DONE]') continue;
    try {
      events.push(JSON.parse(payload) as AssistEvent);
    } catch {
      /* keep non-json lines out of the event list */
    }
  }
  return events;
}
