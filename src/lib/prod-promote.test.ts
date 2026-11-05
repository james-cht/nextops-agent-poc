import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildProdPromoteJob,
  buildProdSiteJob,
  prodJobsForPathEnd,
} from './prod-promote.ts';

describe('prod-promote and per-Site prod jobs', () => {
  it('path end creates prod-promote once, not one promote per Site', () => {
    const jobs = prodJobsForPathEnd({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      sites: ['lh', 'cq'],
      imageDigest: 'sha256:abc',
      publishedPinSha: 'pin-uat',
      credentialIds: ['cred'],
    });
    assert.equal(jobs.filter((j) => j.kind === 'prod-promote').length, 1);
    assert.equal(jobs.filter((j) => j.kind === 'prod-site').length, 0);
    assert.equal(jobs[0].name, 'efactory-ap-prod-promote');
    assert.equal(jobs[0].runsKubectl, false);
    assert.equal(jobs[0].runsSecurityAndPush, true);
  });

  it('Site jobs are kubectl-only, share digest, and NAME_SPACE is never a Site suffix', () => {
    const promote = buildProdPromoteJob({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      imageDigest: 'sha256:abc',
      publishedPinSha: 'pin',
      credentialIds: ['c'],
    });
    const site = buildProdSiteJob({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      siteId: 'lh',
      imageDigest: promote.imageDigest,
      publishedPinSha: 'pin',
      credentialIds: ['kube-lh'],
    });
    assert.equal(site.kind, 'prod-site');
    assert.equal(site.name, 'efactory-ap-prod-lh');
    assert.equal(site.runsKubectl, true);
    assert.equal(site.runsSecurityAndPush, false);
    assert.equal(site.imageDigest, promote.imageDigest);
    assert.equal(site.nameSpace, 'efactory');
    assert.doesNotMatch(site.nameSpace, /lh|cq|control-tower/);
  });

  it('unreleased Sites have no job until Operator releases that Site', () => {
    const afterPromote = prodJobsForPathEnd({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      sites: ['lh', 'cq'],
      imageDigest: 'sha256:abc',
      publishedPinSha: 'pin',
      credentialIds: ['c'],
      releasedSites: [],
    });
    assert.ok(afterPromote.every((j) => j.kind !== 'prod-site'));
    const withLh = prodJobsForPathEnd({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      sites: ['lh', 'cq'],
      imageDigest: 'sha256:abc',
      publishedPinSha: 'pin',
      credentialIds: ['c'],
      releasedSites: ['lh'],
    });
    assert.equal(withLh.filter((j) => j.kind === 'prod-site').length, 1);
    assert.equal(withLh.find((j) => j.kind === 'prod-site')?.siteId, 'lh');
    assert.equal(withLh.some((j) => j.siteId === 'cq'), false);
  });
});
