import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeUsdCost,
  parseModelRateTable,
  resolveModelRateTable,
} from './model-rate-table.ts';

describe('parseModelRateTable', () => {
  it('accepts valid model rates', () => {
    const parsed = parseModelRateTable({
      'gemini-2.5-flash-lite': { inputUsdPerMillion: 0.2, outputUsdPerMillion: 0.8 },
    });
    assert.deepEqual(parsed, {
      'gemini-2.5-flash-lite': { inputUsdPerMillion: 0.2, outputUsdPerMillion: 0.8 },
    });
  });

  it('rejects negative rates', () => {
    assert.equal(
      parseModelRateTable({ x: { inputUsdPerMillion: -1, outputUsdPerMillion: 1 } }),
      null,
    );
  });
});

describe('resolveModelRateTable', () => {
  it('keeps seed rates and overlays stored models', () => {
    const resolved = resolveModelRateTable({
      'custom-model': { inputUsdPerMillion: 1, outputUsdPerMillion: 2 },
    });
    assert.equal(resolved['gemini-2.5-flash-lite']?.inputUsdPerMillion, 0.1);
    assert.equal(resolved['custom-model']?.outputUsdPerMillion, 2);
  });
});

describe('computeUsdCost', () => {
  it('prices a million tokens at the listed USD', () => {
    assert.equal(computeUsdCost(1_000_000, 0, { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4 }), 0.1);
    assert.equal(computeUsdCost(0, 1_000_000, { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4 }), 0.4);
  });
});
