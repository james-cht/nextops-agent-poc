import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canOpenApplicationOnline,
  canWriteApplicationOnline,
  applicationOnlineEmptyState,
} from './application-online.ts';

describe('Application Online access', () => {
  it('lets every authenticated Operator Role open the shell', () => {
    assert.equal(canOpenApplicationOnline('platform_owner'), true);
    assert.equal(canOpenApplicationOnline('operator'), true);
    assert.equal(canOpenApplicationOnline('application_developer'), true);
    assert.equal(canOpenApplicationOnline('viewer'), true);
    assert.equal(canOpenApplicationOnline(null), false);
  });

  it('blocks Viewer from write controls; Developer may write when Membership arrives', () => {
    assert.equal(canWriteApplicationOnline('platform_owner'), true);
    assert.equal(canWriteApplicationOnline('operator'), true);
    assert.equal(canWriteApplicationOnline('application_developer'), true);
    assert.equal(canWriteApplicationOnline('viewer'), false);
    assert.equal(canWriteApplicationOnline(undefined), false);
  });

  it('describes an empty landing with no Project list yet', () => {
    const developer = applicationOnlineEmptyState('application_developer');
    assert.equal(developer.title, '應用上線');
    assert.match(developer.body, /尚未加入任何 Project/);
    assert.equal(developer.readOnly, false);

    const operator = applicationOnlineEmptyState('operator');
    assert.match(operator.body, /建立 Project.*Project Membership/);

    const viewer = applicationOnlineEmptyState('viewer');
    assert.equal(viewer.title, '應用上線');
    assert.equal(viewer.readOnly, true);
    assert.match(viewer.body, /只讀/);
  });
});
