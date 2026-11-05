import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canStartDiagnosisTurn, canViewDiagnosisTraces, operatorAccountTooltip, operatorRoleLabel } from './operator-role.ts';

describe('operatorRoleLabel', () => {
  it('names each Operator Role', () => {
    assert.equal(operatorRoleLabel('platform_owner'), 'Platform Owner');
    assert.equal(operatorRoleLabel('operator'), 'Operator');
    assert.equal(operatorRoleLabel('viewer'), 'Viewer');
    assert.equal(operatorRoleLabel('application_developer'), 'Application Developer');
  });
});

describe('operatorAccountTooltip', () => {
  it('puts username before the Operator Role', () => {
    assert.equal(operatorAccountTooltip('admin', 'platform_owner'), 'admin · Platform Owner');
  });
});

describe('canViewDiagnosisTraces', () => {
  it('is Platform Owner only', () => {
    assert.equal(canViewDiagnosisTraces('platform_owner'), true);
    assert.equal(canViewDiagnosisTraces('operator'), false);
    assert.equal(canViewDiagnosisTraces('application_developer'), false);
    assert.equal(canViewDiagnosisTraces('viewer'), false);
    assert.equal(canViewDiagnosisTraces(null), false);
  });
});

describe('canStartDiagnosisTurn', () => {
  it('blocks Viewer and Application Developer', () => {
    assert.equal(canStartDiagnosisTurn('platform_owner'), true);
    assert.equal(canStartDiagnosisTurn('operator'), true);
    assert.equal(canStartDiagnosisTurn('application_developer'), false);
    assert.equal(canStartDiagnosisTurn('viewer'), false);
    assert.equal(canStartDiagnosisTurn(undefined), false);
  });
});
