import type { KubeSphereJobPort } from './application-online-actions.ts';

export function createUnconfiguredKubeSphereJobPort(): KubeSphereJobPort {
  return {
    async createPipelineJob() {
      return {
        ok: false,
        error:
          'KubeSphere job API not configured (set NEXTOPS_IDP_KUBESPHERE_* in deploy env; full wiring in #33)',
      };
    },
  };
}

export function getKubeSphereJobPort(): {
  kube: KubeSphereJobPort;
  credentialIds: string[];
} {
  const creds = (process.env.NEXTOPS_IDP_DEV_CREDENTIAL_IDS ?? 'harbor-dev,kube-dev')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    kube: createUnconfiguredKubeSphereJobPort(),
    credentialIds: creds,
  };
}
