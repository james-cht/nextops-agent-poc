export type ModelRate = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

export type ModelRateTable = Record<string, ModelRate>;

export const DEFAULT_MODEL_RATE_TABLE: ModelRateTable = {
  'gemini-2.5-flash-lite': { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4 },
};

export function parseModelRateTable(raw: unknown): ModelRateTable | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: ModelRateTable = {};
  for (const [model, rate] of Object.entries(raw as Record<string, unknown>)) {
    if (!model.trim() || !rate || typeof rate !== 'object' || Array.isArray(rate)) continue;
    const rec = rate as { inputUsdPerMillion?: unknown; outputUsdPerMillion?: unknown };
    const input = Number(rec.inputUsdPerMillion);
    const output = Number(rec.outputUsdPerMillion);
    if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) continue;
    out[model.trim()] = { inputUsdPerMillion: input, outputUsdPerMillion: output };
  }
  return Object.keys(out).length ? out : null;
}

/** Merge stored overrides onto the shipped seed table. */
export function resolveModelRateTable(stored: ModelRateTable | null): ModelRateTable {
  return { ...DEFAULT_MODEL_RATE_TABLE, ...(stored ?? {}) };
}

export function computeUsdCost(
  inputTokens: number,
  outputTokens: number,
  rate: ModelRate | undefined,
): number {
  if (!rate) return 0;
  return (inputTokens * rate.inputUsdPerMillion + outputTokens * rate.outputUsdPerMillion) / 1_000_000;
}
