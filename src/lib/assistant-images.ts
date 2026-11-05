export type AcceptedAssistantImage = {
  status: 'accepted';
  url: string;
};

export type BlockedAssistantImage = {
  status: 'blocked';
  host: string;
  reason: 'host_not_allowlisted' | 'insecure_scheme' | 'invalid_url';
};

export type ImageUrlEvaluation = AcceptedAssistantImage | BlockedAssistantImage;

export type ExtractedAnswerImages = {
  urls: string[];
  text: string;
};

export type AssistantImagesPayload = {
  text: string;
  images: Array<{ url: string }>;
  blocked: Array<{ host: string; reason: BlockedAssistantImage['reason'] }>;
  truncated: boolean;
};

export const MAX_ASSISTANT_IMAGES = 3;

const MEDIA_FENCE_RE = /```media\s*\n([\s\S]*?)```/gi;
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Parse comma-separated Image Allowlist hostnames from server env. */
export function parseImageAllowlist(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Evaluate a candidate Assistant Image URL against the Image Allowlist.
 * Accepted URLs must be https and host-matched (case-insensitive).
 * Blocked results expose hostname only — never the full URL.
 */
export function evaluateImageUrl(
  candidate: string,
  allowlist: ReadonlySet<string>,
): ImageUrlEvaluation {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { status: 'blocked', host: '', reason: 'invalid_url' };
  }

  const host = parsed.hostname.toLowerCase();

  if (parsed.protocol !== 'https:') {
    return { status: 'blocked', host, reason: 'insecure_scheme' };
  }

  if (!allowlist.has(host)) {
    return { status: 'blocked', host, reason: 'host_not_allowlisted' };
  }

  return { status: 'accepted', url: parsed.toString() };
}

function pushUnique(urls: string[], candidate: string) {
  if (!candidate || urls.includes(candidate)) return;
  urls.push(candidate);
}

function urlsFromMediaJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as { images?: Array<{ url?: string }> };
    if (!Array.isArray(parsed?.images)) return [];
    return parsed.images
      .map((item) => (typeof item?.url === 'string' ? item.url.trim() : ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Pull Assistant Image URLs from fenced `media` JSON and markdown images,
 * and return answer text with those markers removed.
 */
export function extractImageUrlsFromAnswer(answerText: string): ExtractedAnswerImages {
  const urls: string[] = [];
  let text = answerText;

  text = text.replace(MEDIA_FENCE_RE, (_full, body: string) => {
    for (const url of urlsFromMediaJson(body)) pushUnique(urls, url);
    return '';
  });

  text = text.replace(MARKDOWN_IMAGE_RE, (_full, _alt: string, url: string) => {
    pushUnique(urls, url.trim());
    return '';
  });

  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return { urls, text };
}

/**
 * Resolve Assistant Images from native Dify URLs + answer text extraction,
 * evaluate against the Image Allowlist, and return sanitized visible text.
 */
export function resolveAssistantImages(opts: {
  answerText: string;
  nativeUrls?: string[];
  allowlist: ReadonlySet<string>;
}): AssistantImagesPayload {
  const extracted = extractImageUrlsFromAnswer(opts.answerText);
  const candidates: string[] = [];
  for (const url of opts.nativeUrls ?? []) pushUnique(candidates, url);
  for (const url of extracted.urls) pushUnique(candidates, url);

  const acceptedUrls: string[] = [];
  const blocked: Array<{ host: string; reason: BlockedAssistantImage['reason'] }> = [];
  const seenBlocked = new Set<string>();

  for (const candidate of candidates) {
    const evaluation = evaluateImageUrl(candidate, opts.allowlist);
    if (evaluation.status === 'accepted') {
      if (!acceptedUrls.includes(evaluation.url)) {
        acceptedUrls.push(evaluation.url);
      }
    } else {
      const key = `${evaluation.host}|${evaluation.reason}`;
      if (!seenBlocked.has(key)) {
        seenBlocked.add(key);
        blocked.push({ host: evaluation.host, reason: evaluation.reason });
      }
    }
  }

  const truncated = acceptedUrls.length > MAX_ASSISTANT_IMAGES;
  const images = acceptedUrls.slice(0, MAX_ASSISTANT_IMAGES).map((url) => ({ url }));

  return {
    text: extracted.text,
    images,
    blocked,
    truncated,
  };
}
