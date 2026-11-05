import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bindingEnvironmentsForPath,
  computeConfigCheck,
  evaluateQaBindingGate,
  normalizeEnvironmentBindings,
  canRecordEnvironmentBinding,
} from './environment-binding.ts';
import type { ResourceRequestSheet } from './resource-request.ts';

function neededDb(): ResourceRequestSheet {
  return { kind: 'db', status: 'needed', fields: { engine: 'sqlserver', size: '100G' } };
}

function emptySheets(): ResourceRequestSheet[] {
  return [
    { kind: 'files', status: 'not_needed', fields: {} },
    { kind: 'networks', status: 'not_needed', fields: {} },
    { kind: 'middleware', status: 'not_needed', fields: {} },
    { kind: 'vm', status: 'not_needed', fields: {} },
    { kind: 'db', status: 'not_needed', fields: {} },
    { kind: 'minio', status: 'not_needed', fields: {} },
    { kind: 'domains', status: 'not_needed', fields: {} },
  ];
}

describe('Environment Binding and Config Check', () => {
  it('lists QA and later hops for Binding gate; strips secrets from Binding fields', () => {
    assert.deepEqual(bindingEnvironmentsForPath('dev→qa→uat→prod'), ['qa', 'uat', 'prod']);
    assert.deepEqual(bindingEnvironmentsForPath('dev→prod'), []);
    const normalized = normalizeEnvironmentBindings([
      {
        environment: 'qa',
        kind: 'db',
        fields: { host: '192.0.2.9', password: 'secret', kubeconfig: 'k' },
      },
    ]);
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].fields.host, '192.0.2.9');
    assert.equal(Object.hasOwn(normalized[0].fields, 'password'), false);
    assert.equal(Object.hasOwn(normalized[0].fields, 'kubeconfig'), false);
  });

  it('rejects QA release when filled Resource Requests lack Binding; empty sheets do not block', () => {
    const sheets = emptySheets().map((s) => (s.kind === 'db' ? neededDb() : s));
    const blocked = evaluateQaBindingGate({
      promotionPath: 'dev→qa→uat→prod',
      sheets,
      bindings: [],
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.ok(blocked.missing.some((m) => m.environment === 'qa' && m.kind === 'db'));
      assert.ok(blocked.missing.some((m) => m.environment === 'prod' && m.kind === 'db'));
    }

    const allowedEmpty = evaluateQaBindingGate({
      promotionPath: 'dev→qa→uat→prod',
      sheets: emptySheets(),
      bindings: [],
    });
    assert.equal(allowedEmpty.ok, true);

    const allowedBound = evaluateQaBindingGate({
      promotionPath: 'dev→qa→uat→prod',
      sheets,
      bindings: [
        { environment: 'qa', kind: 'db', fields: { host: 'qa-db' } },
        { environment: 'uat', kind: 'db', fields: { host: 'uat-db' } },
        { environment: 'prod', kind: 'db', fields: { host: 'prod-db' } },
      ],
    });
    assert.equal(allowedBound.ok, true);
  });

  it('Config Check lists missing Bindings and off-catalog FROM warnings; Dev is not gated', () => {
    const sheets = emptySheets().map((s) => (s.kind === 'db' ? neededDb() : s));
    const check = computeConfigCheck({
      promotionPath: 'dev→qa→prod',
      sheets,
      bindings: [{ environment: 'qa', kind: 'db', fields: { host: 'qa-db' } }],
      offCatalogFromWarning: true,
    });
    assert.ok(check.items.some((i) => i.level === 'error' && /prod.*db/i.test(i.message)));
    assert.ok(check.items.some((i) => i.level === 'warn' && /FROM/i.test(i.message)));
    assert.equal(check.blocksQaRelease, true);
    assert.equal(check.blocksDevValidate, false);
  });

  it('only Operator and Platform Owner may record Environment Binding', () => {
    assert.equal(canRecordEnvironmentBinding('operator'), true);
    assert.equal(canRecordEnvironmentBinding('platform_owner'), true);
    assert.equal(canRecordEnvironmentBinding('application_developer'), false);
    assert.equal(canRecordEnvironmentBinding('viewer'), false);
  });
});
