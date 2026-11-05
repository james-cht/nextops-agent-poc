import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applicationCatalogEmptyState,
  canRegisterApplication,
  canUnregisterApplication,
} from './application-catalog.ts';

describe('Application Catalog shell access', () => {
  it('lets Owner and Operator see Registration and Unregistration controls', () => {
    assert.equal(canRegisterApplication('platform_owner'), true);
    assert.equal(canRegisterApplication('operator'), true);
    assert.equal(canUnregisterApplication('platform_owner'), true);
    assert.equal(canUnregisterApplication('operator'), true);
  });

  it('blocks Viewer and Application Developer from write controls', () => {
    assert.equal(canRegisterApplication('viewer'), false);
    assert.equal(canRegisterApplication('application_developer'), false);
    assert.equal(canUnregisterApplication('viewer'), false);
    assert.equal(canUnregisterApplication('application_developer'), false);
    assert.equal(canRegisterApplication(null), false);
  });

  it('describes an empty catalog without inventing Applications', () => {
    const writer = applicationCatalogEmptyState('operator');
    assert.equal(writer.title, '應用目錄');
    assert.match(writer.body, /登記 Application/);
    assert.equal(writer.showRegister, true);
    assert.equal(writer.showUnregister, true);

    const viewer = applicationCatalogEmptyState('viewer');
    assert.equal(viewer.title, '應用目錄');
    assert.equal(viewer.showRegister, false);
    assert.equal(viewer.showUnregister, false);
    assert.match(viewer.body, /只讀/);
  });
});
