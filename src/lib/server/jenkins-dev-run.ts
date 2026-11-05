import type { JenkinsDevRunPort } from './application-online-actions.ts';

export function createUnconfiguredJenkinsDevRunPort(): JenkinsDevRunPort {
  return {
    async enqueueDevValidate() {
      return {
        ok: false,
        error:
          'Jenkins Dev run adapter not configured (set NEXTOPS_IDP_JENKINS_* in deploy env; full wiring in #33)',
      };
    },
    async getDevRunStatus() {
      return {
        ok: false,
        error:
          'Jenkins Dev run adapter not configured (set NEXTOPS_IDP_JENKINS_* in deploy env; full wiring in #33)',
      };
    },
  };
}

export function getJenkinsDevRunPort(): JenkinsDevRunPort {
  return createUnconfiguredJenkinsDevRunPort();
}
