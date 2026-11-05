/** AiBridge Gateway unified/chat client (Gemini Control Tower SOP). */

export type AiBridgeChatOpts = {
  baseUrl: string;
  employeeId: string;
  model: string;
  question: string;
  systemPrompt?: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

export type AiBridgeChatResult = {
  ok: boolean;
  status: number;
  content: string;
  rawText: string;
};

export async function aibridgeChat(opts: AiBridgeChatOpts): Promise<AiBridgeChatResult> {
  const base = opts.baseUrl.replace(/\/+$/, '');
  const url = `${base}/api/v1/unified/chat`;
  const form = new FormData();
  form.set('employee_id', opts.employeeId);
  form.set('question', opts.question);
  form.set('model', opts.model);
  if (opts.systemPrompt?.trim()) {
    form.set('system_prompt', opts.systemPrompt.trim());
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const fetchImpl = opts.fetchImpl ?? fetch;
    const res = await fetchImpl(url, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    const rawText = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      content: extractContent(rawText),
      rawText,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function extractContent(rawText: string): string {
  try {
    const parsed = JSON.parse(rawText) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.trim()) return content;
  } catch {
    /* not JSON */
  }
  return rawText;
}
