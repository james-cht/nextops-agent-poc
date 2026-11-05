import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canInvokeBreakGlass, recordBreakGlassSkip } from './break-glass.ts';

describe('Recorded break-glass skip', () => {
  it('only Operator/Owner may invoke; Developer and Viewer cannot', () => {
    assert.equal(canInvokeBreakGlass('operator'), true);
    assert.equal(canInvokeBreakGlass('platform_owner'), true);
    assert.equal(canInvokeBreakGlass('application_developer'), false);
    assert.equal(canInvokeBreakGlass('viewer'), false);
  });

  it('records who, why, which Project/Service/hop and does not become silent default', () => {
    const entry = recordBreakGlassSkip({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      hop: 'qa',
      reason: 'emergency middleware delay',
      actor: 'ops',
      rule: 'binding_gate',
      at: new Date('2026-03-03T00:00:00.000Z'),
    });
    assert.equal(entry.nameSpace, 'efactory');
    assert.equal(entry.hop, 'qa');
    assert.equal(entry.rule, 'binding_gate');
    assert.match(entry.reason, /emergency/);
    assert.equal(entry.actor, 'ops');
    assert.equal(entry.becomesDefaultPath, false);
  });
});
