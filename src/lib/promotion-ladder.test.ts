import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canReleaseNextHop,
  jobsAllowedOnPath,
  previousHop,
  resolveSourceImage,
  buildHopJobCreate,
} from './promotion-ladder.ts';

describe('Promotion Path ladder', () => {
  it('four catalog paths determine which jobs exist; dev→prod never creates QA/UAT', () => {
    assert.deepEqual(jobsAllowedOnPath('dev→qa→uat→prod'), ['dev', 'qa', 'uat', 'prod']);
    assert.deepEqual(jobsAllowedOnPath('dev→prod'), ['dev', 'prod']);
    assert.equal(jobsAllowedOnPath('dev→prod').includes('qa'), false);
    assert.equal(jobsAllowedOnPath('dev→prod').includes('uat'), false);
  });

  it('previous hop supplies SOURCE_IMAGE; promote hop job pins prior SHA and image', () => {
    assert.equal(previousHop('dev→qa→uat→prod', 'qa'), 'dev');
    assert.equal(previousHop('dev→prod', 'prod'), 'dev');
    assert.equal(previousHop('dev→qa→uat→prod', 'prod'), 'uat');
    assert.equal(
      resolveSourceImage({
        previousEnvironment: 'uat',
        nameSpace: 'efactory',
        appName: 'efactory-ap',
        imageTag: 'sha-abc',
      }),
      'harbor.example/efactory/efactory-ap-uat:sha-abc',
    );
    const job = buildHopJobCreate({
      nameSpace: 'efactory',
      appName: 'efactory-ap',
      environment: 'qa',
      templateFamily: 'promote',
      publishedPinSha: 'pin-from-dev',
      sourceImage: 'harbor.example/efactory/efactory-ap-dev:sha-abc',
      credentialIds: ['cred-git'],
    });
    assert.equal(job.environment, 'qa');
    assert.equal(job.name, 'efactory-ap-qa');
    assert.equal(job.publishedPinSha, 'pin-from-dev');
    assert.equal(job.sourceImage, 'harbor.example/efactory/efactory-ap-dev:sha-abc');
    assert.equal(job.templateFamily, 'promote');
    // Central Jenkinsfile must read SOURCE_IMAGE from this job parameter (not hardcoded QA Harbor).
    assert.equal(Object.hasOwn(job, 'sourceImage'), true);
  });

  it('rejects release without green previous hop, off-path hop, Developer, or Binding gate fail', () => {
    assert.equal(
      canReleaseNextHop({
        role: 'application_developer',
        promotionPath: 'dev→qa→prod',
        targetEnvironment: 'qa',
        previousHopStatus: 'success_apply',
        bindingGateOk: true,
        familyMatchesPublished: true,
      }).ok,
      false,
    );
    assert.equal(
      canReleaseNextHop({
        role: 'operator',
        promotionPath: 'dev→prod',
        targetEnvironment: 'qa',
        previousHopStatus: 'success_apply',
        bindingGateOk: true,
        familyMatchesPublished: true,
      }).ok,
      false,
    );
    assert.equal(
      canReleaseNextHop({
        role: 'operator',
        promotionPath: 'dev→qa→prod',
        targetEnvironment: 'qa',
        previousHopStatus: 'failed',
        bindingGateOk: true,
        familyMatchesPublished: true,
      }).ok,
      false,
    );
    assert.equal(
      canReleaseNextHop({
        role: 'operator',
        promotionPath: 'dev→qa→prod',
        targetEnvironment: 'qa',
        previousHopStatus: 'success_apply',
        bindingGateOk: false,
        familyMatchesPublished: true,
      }).ok,
      false,
    );
    assert.equal(
      canReleaseNextHop({
        role: 'operator',
        promotionPath: 'dev→qa→prod',
        targetEnvironment: 'qa',
        previousHopStatus: 'success_apply',
        bindingGateOk: true,
        familyMatchesPublished: false,
      }).ok,
      false,
    );
    assert.equal(
      canReleaseNextHop({
        role: 'operator',
        promotionPath: 'dev→qa→prod',
        targetEnvironment: 'qa',
        previousHopStatus: 'success_apply',
        bindingGateOk: true,
        familyMatchesPublished: true,
      }).ok,
      true,
    );
  });
});
