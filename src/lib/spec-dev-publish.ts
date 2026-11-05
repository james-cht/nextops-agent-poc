import type { TemplateFamily } from './service-deploy-spec.ts';

export function canRecordPublishedPin(opts: {
  hasOpenedMr: boolean;
  mrMerged: boolean;
  publishedSha: string;
}): { ok: true } | { ok: false; code: 'BAD_REQUEST'; error: string } {
  const sha = opts.publishedSha.trim();
  if (!sha) {
    return { ok: false, code: 'BAD_REQUEST', error: 'Published SHA is required' };
  }
  if (!opts.hasOpenedMr) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: 'Unpublished draft cannot become a job pin',
    };
  }
  if (!opts.mrMerged) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: 'Central MR must be merged before recording published SHA',
    };
  }
  return { ok: true };
}

export type DevKubeSphereJobCreate = {
  name: string;
  environment: 'dev';
  templateFamily: TemplateFamily;
  credentialIds: string[];
};

export function buildDevKubeSphereJobCreate(opts: {
  nameSpace: string;
  appName: string;
  templateFamily: TemplateFamily;
  credentialIds: string[];
}): DevKubeSphereJobCreate {
  return {
    name: `${opts.appName.trim().toLowerCase()}-dev`,
    environment: 'dev',
    templateFamily: opts.templateFamily,
    credentialIds: [...opts.credentialIds],
  };
}
