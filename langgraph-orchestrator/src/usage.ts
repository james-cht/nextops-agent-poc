export const TRACE_PAYLOAD_MAX_CHARS = 64 * 1024;

export type ModelRate = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

export type TraceUsage = {
  inputTokens: number;
  outputTokens: number;
  usd: number;
  source: 'recorded' | 'estimated';
};

export function truncateField(value: string, max = TRACE_PAYLOAD_MAX_CHARS): { value: string; truncated: boolean } {
  if (value.length <= max) return { value, truncated: false };
  return { value: value.slice(0, max), truncated: true };
}

export function estimateTokens(text: string): number {
  const n = [...text].length;
  return Math.max(0, Math.ceil(n / 4));
}

export function extractRecordedUsage(rawText: string): { inputTokens: number; outputTokens: number } | null {
  try {
    const parsed = JSON.parse(rawText) as {
      usage?: {
        prompt_tokens?: unknown;
        completion_tokens?: unknown;
        input_tokens?: unknown;
        output_tokens?: unknown;
      };
    };
    const usage = parsed.usage;
    if (!usage || typeof usage !== 'object') return null;
    const input = Number(usage.prompt_tokens ?? usage.input_tokens);
    const output = Number(usage.completion_tokens ?? usage.output_tokens);
    if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return null;
    return { inputTokens: input, outputTokens: output };
  } catch {
    return null;
  }
}

export function computeUsdCost(inputTokens: number, outputTokens: number, rate: ModelRate | undefined): number {
  if (!rate) return 0;
  return (inputTokens * rate.inputUsdPerMillion + outputTokens * rate.outputUsdPerMillion) / 1_000_000;
}

export function buildTraceUsage(opts: {
  rawResponse: string;
  systemPrompt: string;
  question: string;
  answer: string;
  model: string;
  rates: Record<string, ModelRate>;
}): TraceUsage {
  const recorded = extractRecordedUsage(opts.rawResponse);
  const inputTokens = recorded?.inputTokens ?? estimateTokens(`${opts.systemPrompt}\n${opts.question}`);
  const outputTokens = recorded?.outputTokens ?? estimateTokens(opts.answer);
  return {
    inputTokens,
    outputTokens,
    usd: computeUsdCost(inputTokens, outputTokens, opts.rates[opts.model]),
    source: recorded ? 'recorded' : 'estimated',
  };
}
