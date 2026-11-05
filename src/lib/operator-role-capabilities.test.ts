import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  capabilityAllowed,
  OPERATOR_ROLE_CAPABILITIES,
  operatorRoleCapabilityGroups,
} from './operator-role-capabilities.ts';

describe('Operator Role capability matrix', () => {
  it('lets only Platform Owner manage other Operator Accounts and Runtime Settings', () => {
    assert.equal(capabilityAllowed('manage_other_accounts', 'platform_owner'), true);
    assert.equal(capabilityAllowed('manage_other_accounts', 'operator'), false);
    assert.equal(capabilityAllowed('manage_other_accounts', 'application_developer'), false);
    assert.equal(capabilityAllowed('manage_other_accounts', 'viewer'), false);
    assert.equal(capabilityAllowed('change_runtime_settings', 'platform_owner'), true);
    assert.equal(capabilityAllowed('change_runtime_settings', 'operator'), false);
    assert.equal(capabilityAllowed('change_runtime_settings', 'application_developer'), false);
    assert.equal(capabilityAllowed('read_diagnosis_traces', 'operator'), false);
    assert.equal(capabilityAllowed('read_diagnosis_traces', 'application_developer'), false);
  });

  it('lets Operator acknowledge and diagnose, and blocks Viewer and Application Developer from those', () => {
    assert.equal(capabilityAllowed('acknowledge_alerts', 'operator'), true);
    assert.equal(capabilityAllowed('acknowledge_alerts', 'viewer'), false);
    assert.equal(capabilityAllowed('acknowledge_alerts', 'application_developer'), false);
    assert.equal(capabilityAllowed('start_ai_diagnosis', 'operator'), true);
    assert.equal(capabilityAllowed('start_ai_diagnosis', 'viewer'), false);
    assert.equal(capabilityAllowed('start_ai_diagnosis', 'application_developer'), false);
    assert.equal(capabilityAllowed('invoke_opsgpt_chat', 'application_developer'), false);
    assert.equal(capabilityAllowed('trigger_live_pod_diagnostics', 'viewer'), false);
    assert.equal(capabilityAllowed('trigger_live_pod_diagnostics', 'application_developer'), false);
    assert.equal(capabilityAllowed('read_live_pod_diagnostics', 'viewer'), true);
    assert.equal(capabilityAllowed('read_live_pod_diagnostics', 'application_developer'), true);
    assert.equal(capabilityAllowed('change_own_authenticators', 'operator'), true);
    assert.equal(capabilityAllowed('change_own_authenticators', 'application_developer'), true);
    assert.equal(capabilityAllowed('change_own_authenticators', 'viewer'), false);
    assert.equal(capabilityAllowed('revoke_own_sessions', 'viewer'), true);
    assert.equal(capabilityAllowed('revoke_own_sessions', 'application_developer'), true);
    assert.equal(capabilityAllowed('read_own_login_events', 'viewer'), true);
    assert.equal(capabilityAllowed('read_dashboard', 'application_developer'), true);
  });

  it('lets every role read Application Catalog; only Owner and Operator register or unregister', () => {
    assert.equal(capabilityAllowed('read_application_catalog', 'platform_owner'), true);
    assert.equal(capabilityAllowed('read_application_catalog', 'operator'), true);
    assert.equal(capabilityAllowed('read_application_catalog', 'application_developer'), true);
    assert.equal(capabilityAllowed('read_application_catalog', 'viewer'), true);
    assert.equal(capabilityAllowed('application_registration', 'platform_owner'), true);
    assert.equal(capabilityAllowed('application_registration', 'operator'), true);
    assert.equal(capabilityAllowed('application_registration', 'application_developer'), false);
    assert.equal(capabilityAllowed('application_registration', 'viewer'), false);
    assert.equal(capabilityAllowed('application_unregistration', 'platform_owner'), true);
    assert.equal(capabilityAllowed('application_unregistration', 'operator'), true);
    assert.equal(capabilityAllowed('application_unregistration', 'application_developer'), false);
    assert.equal(capabilityAllowed('application_unregistration', 'viewer'), false);
  });

  it('groups rows for the read-only Roles matrix', () => {
    const groups = operatorRoleCapabilityGroups();
    assert.deepEqual(
      groups.map((g) => g.id),
      ['accounts', 'settings', 'diagnosis_governance', 'daily'],
    );
    assert.ok(OPERATOR_ROLE_CAPABILITIES.length >= 12);
    assert.ok(groups.every((g) => g.rows.length > 0));
    assert.ok(
      OPERATOR_ROLE_CAPABILITIES.every(
        (row) =>
          'application_developer' in row.allowed &&
          typeof row.allowed.application_developer === 'boolean',
      ),
    );
  });
});
