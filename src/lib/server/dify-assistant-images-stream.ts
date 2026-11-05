import {
  resolveAssistantImages,
  parseImageAllowlist,
  type AssistantImagesPayload,
} from '../assistant-images.ts';

export type AssistantImagesSsePayload = {
  images: Array<{ url: string }>;
  blocked: Array<{ host: string; reason: string }>;
  truncated: boolean;
  textSanitized: string;
};

export function buildImageAllowlist(opts: {
  /** Hostname source for orchestrator / media (AiBridge Gateway). */
  mediaBaseUrl?: string;
  allowlistEnv?: string;
}): Set<string> {
  const hosts = new Set(parseImageAllowlist(opts.allowlistEnv));
  const media = opts.mediaBaseUrl?.trim();
  if (media) {
    try {
      const host = new URL(media).hostname.toLowerCase();
      if (host) hosts.add(host);
    } catch {
      // ignore invalid media base URL
    }
  }
  return hosts;
}

export function formatAssistantImagesSseEvent(payload: AssistantImagesPayload): string {
  const body: AssistantImagesSsePayload = {
    images: payload.images,
    blocked: payload.blocked,
    truncated: payload.truncated,
    textSanitized: payload.text,
  };
  return `event: assistant_images\ndata: ${JSON.stringify(body)}\n\n`;
}

function collectNativeUrlsFromData(data: unknown, into: string[]) {
  if (!data || typeof data !== 'object') return;
  const files = (data as { files?: unknown }).files;
  if (!Array.isArray(files)) return;
  for (const file of files) {
    if (!file || typeof file !== 'object') continue;
    const f = file as { type?: string; url?: string; remote_url?: string };
    const type = (f.type ?? '').toLowerCase();
    if (type && type !== 'image') continue;
    const url = (typeof f.url === 'string' && f.url) || (typeof f.remote_url === 'string' && f.remote_url) || '';
    if (url && !into.includes(url)) into.push(url);
  }
}

/**
 * Pass-through Dify SSE enricher: forwards events, accumulates answer/native URLs,
 * and after `message_end` appends one `assistant_images` event.
 */
export class AssistantImagesSseEnricher {
  #buffer = '';
  #answer = '';
  #nativeUrls: string[] = [];
  #ended = false;
  #allowlist: ReadonlySet<string>;

  constructor(allowlist: ReadonlySet<string>) {
    this.#allowlist = allowlist;
  }

  push(chunk: string): string {
    this.#buffer += chunk;
    let out = '';

    while (true) {
      const sep = this.#buffer.indexOf('\n\n');
      if (sep < 0) break;
      const block = this.#buffer.slice(0, sep);
      this.#buffer = this.#buffer.slice(sep + 2);
      if (!block.trim()) continue;
      out += this.#handleBlock(block);
    }

    return out;
  }

  /** Flush incomplete trailing buffer (no assistant_images unless message_end already handled). */
  end(): string {
    if (!this.#buffer.trim()) return '';
    const block = this.#buffer;
    this.#buffer = '';
    return this.#handleBlock(block);
  }

  #handleBlock(block: string): string {
    const lines = block.split('\n');
    let eventType = '';
    let dataStr = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) eventType = line.slice(7).trim();
      else if (line.startsWith('data: ')) dataStr = line.slice(6);
    }

    const forwarded = `${block}\n\n`;

    if (!eventType || !dataStr) return forwarded;

    let data: unknown;
    try {
      data = JSON.parse(dataStr);
    } catch {
      return forwarded;
    }

    if (eventType === 'message' || eventType === 'agent_message') {
      const answer = (data as { answer?: string }).answer;
      if (typeof answer === 'string') this.#answer += answer;
      collectNativeUrlsFromData(data, this.#nativeUrls);
      return forwarded;
    }

    if (eventType === 'message_end' && !this.#ended) {
      this.#ended = true;
      collectNativeUrlsFromData(data, this.#nativeUrls);
      const resolved = resolveAssistantImages({
        answerText: this.#answer,
        nativeUrls: this.#nativeUrls,
        allowlist: this.#allowlist,
      });
      return forwarded + formatAssistantImagesSseEvent(resolved);
    }

    return forwarded;
  }
}

/** Wrap an upstream Dify SSE body with Assistant Images enrichment. */
export function enrichDifySseReadableStream(
  upstream: ReadableStream<Uint8Array>,
  allowlist: ReadonlySet<string>,
): ReadableStream<Uint8Array> {
  const enricher = new AssistantImagesSseEnricher(allowlist);
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return upstream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const text = decoder.decode(chunk, { stream: true });
        const out = enricher.push(text);
        if (out) controller.enqueue(encoder.encode(out));
      },
      flush(controller) {
        const out = enricher.end();
        if (out) controller.enqueue(encoder.encode(out));
      },
    }),
  );
}
