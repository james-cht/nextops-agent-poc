export type ChatImageNotice = {
  kind: 'blocked' | 'load_failed';
  host: string;
};

export type AssistantImagesClientPayload = {
  images: Array<{ url: string }>;
  blocked: Array<{ host: string; reason: string }>;
  truncated: boolean;
  textSanitized: string;
};

export type AssistantChatView = {
  content: string;
  images: Array<{ url: string }>;
  notices: ChatImageNotice[];
  truncated: boolean;
};

/** Merge end-of-stream Assistant Images into the visible assistant message view. */
export function applyAssistantImagesPayload(
  currentContent: string,
  payload: AssistantImagesClientPayload,
): AssistantChatView {
  const content =
    typeof payload.textSanitized === 'string' && payload.textSanitized.length > 0
      ? payload.textSanitized
      : currentContent;

  const notices: ChatImageNotice[] = payload.blocked.map((b) => ({
    kind: 'blocked' as const,
    host: b.host,
  }));

  return {
    content,
    images: payload.images.map((img) => ({ url: img.url })),
    notices,
    truncated: Boolean(payload.truncated),
  };
}

/** Build a Blocked Image Notice for a browser load failure (hostname only). */
export function noticeForImageLoadFailure(url: string): ChatImageNotice {
  try {
    return { kind: 'load_failed', host: new URL(url).hostname };
  } catch {
    return { kind: 'load_failed', host: '' };
  }
}

export function truncationNoticeText(): string {
  return '僅顯示前 3 張圖片，其餘已省略';
}

/** OPSGPT chat chrome — Diagnosis Orchestrator is LangGraph (ADR-0023). */
export const OPSGPT_CHAT_FOOTER = 'Powered by NextOps · LangGraph';

export function blockedNoticeText(host: string): string {
  return host
    ? `圖片主機未在允許清單：${host}`
    : '圖片主機未在允許清單';
}

export function loadFailedNoticeText(host: string): string {
  return host ? `圖片載入失敗：${host}` : '圖片載入失敗';
}
