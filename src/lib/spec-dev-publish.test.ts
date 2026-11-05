import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDevKubeSphereJobCreate,
  canRecordPublishedPin,
} from './spec-dev-publish.ts';

describe('Service Deploy Spec — published SHA and Dev job only', () => {
  it('refuses to pin an unpublished draft', () => {
    assert.equal(
      canRecordPublishedPin({
        hasOpenedMr: false,
        mrMerged: false,
        publishedSha: 'abc123',
      }).ok,
      false,
    );
    assert.equal(
      canRecordPublishedPin({
        hasOpenedMr: true,
        mrMerged: false,
        publishedSha: 'abc123',
      }).ok,
      false,
    );
    const ok = canRecordPublishedPin({
      hasOpenedMr: true,
      mrMerged: true,
      publishedSha: 'deadbeef',
    });
    assert.equal(ok.ok, true);
  });

  it('builds only a Dev job create payload with template + credentials, not Dockerfile blobs', () => {
    const job = buildDevKubeSphereJobCreate({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      templateFamily: 'promote',
      credentialIds: ['harbor-dev', 'kube-dev'],
    });
    assert.equal(job.environment, 'dev');
    assert.equal(job.name, 'efactory-ap-dev');
    assert.equal(job.templateFamily, 'promote');
    assert.deepEqual(job.credentialIds, ['harbor-dev', 'kube-dev']);
    assert.equal(Object.hasOwn(job, 'dockerfile'), false);
    assert.equal(Object.hasOwn(job, 'packagingCommand'), false);
    assert.equal(Object.hasOwn(job, 'gitlabUrl'), false);
  });
});
