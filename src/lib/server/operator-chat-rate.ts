const HUMAN_LIMIT = 20;
const HUMAN_WINDOW_MS = 60_000;
const AI_LIMIT = 10;
const AI_WINDOW_MS = 60 * 60 * 1000;

const hits = new Map<string, number[]>();
const aiHits = new Map<string, number[]>();
const aiPending = new Set<string>();

/** True if the send is allowed and recorded. */
export function consumeHumanChatRate(username: string, now = Date.now()): boolean {
  const key = username.trim();
  if (!key) return false;
  const windowStart = now - HUMAN_WINDOW_MS;
  const prev = (hits.get(key) ?? []).filter((t) => t > windowStart);
  if (prev.length >= HUMAN_LIMIT) {
    hits.set(key, prev);
    return false;
  }
  prev.push(now);
  hits.set(key, prev);
  return true;
}

export type ChatAiRateResult =
  | { ok: true }
  | { ok: false; code: 'PENDING' | 'RATE_LIMITED' };

/** One in-flight Operator Chat AI turn per account, and 10 turns / hour (failures count). */
export function consumeChatAiTurn(username: string, now = Date.now()): ChatAiRateResult {
  const key = username.trim();
  if (!key) return { ok: false, code: 'RATE_LIMITED' };
  if (aiPending.has(key)) return { ok: false, code: 'PENDING' };
  const windowStart = now - AI_WINDOW_MS;
  const prev = (aiHits.get(key) ?? []).filter((t) => t > windowStart);
  if (prev.length >= AI_LIMIT) {
    aiHits.set(key, prev);
    return { ok: false, code: 'RATE_LIMITED' };
  }
  prev.push(now);
  aiHits.set(key, prev);
  aiPending.add(key);
  return { ok: true };
}

export function releaseChatAiTurn(username: string): void {
  aiPending.delete(username.trim());
}

export function _resetHumanChatRateForTests(): void {
  hits.clear();
  aiHits.clear();
  aiPending.clear();
}
