import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildHopJobCreate } from './promotion-ladder.ts';
import { webRebuildAllowsCompileTimeEnv, hopRequiresDigestPin } from './web-rebuild-ladder.ts';

describe('web-rebuild family on the ladder', () => {
  it('web-rebuild hops use web templates and do not require image digest pin', () => {
    const qa = buildHopJobCreate({
      nameSpace: 'efactory',
      appName: 'portal',
      environment: 'qa',
      templateFamily: 'web-rebuild',
      publishedPinSha: 'pipeline-sha',
      sourceImage: null,
      credentialIds: ['c'],
    });
    assert.equal(qa.templateFamily, 'web-rebuild');
    assert.equal(qa.sourceImage, null);
    assert.equal(hopRequiresDigestPin('web-rebuild'), false);
    assert.equal(hopRequiresDigestPin('promote'), true);
    assert.equal(webRebuildAllowsCompileTimeEnv(true), true);
  });

  it('same path distinguishes promote vs web-rebuild job-create payloads', () => {
    const promote = buildHopJobCreate({
      nameSpace: 'efactory',
      appName: 'portal',
      environment: 'qa',
      templateFamily: 'promote',
      publishedPinSha: 'pipeline-sha',
      sourceImage: 'harbor.example/efactory/portal-dev:t',
      credentialIds: ['c'],
    });
    const web = buildHopJobCreate({
      nameSpace: 'efactory',
      appName: 'portal',
      environment: 'qa',
      templateFamily: 'web-rebuild',
      publishedPinSha: 'pipeline-sha',
      sourceImage: null,
      credentialIds: ['c'],
    });
    assert.notEqual(promote.templateFamily, web.templateFamily);
    assert.ok(promote.sourceImage);
    assert.equal(web.sourceImage, null);
    assert.equal(promote.publishedPinSha, web.publishedPinSha);
  });
});
