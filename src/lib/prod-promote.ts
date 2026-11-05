export type ProdJobKind = 'prod-promote' | 'prod-site';

export type ProdJobCreate = {
  kind: ProdJobKind;
  name: string;
  nameSpace: string;
  appName: string;
  siteId: string | null;
  imageDigest: string;
  publishedPinSha: string;
  credentialIds: string[];
  runsKubectl: boolean;
  runsSecurityAndPush: boolean;
};

export function buildProdPromoteJob(opts: {
  nameSpace: string;
  appName: string;
  imageDigest: string;
  publishedPinSha: string;
  credentialIds: string[];
}): ProdJobCreate {
  const nameSpace = opts.nameSpace.trim().toLowerCase();
  const appName = opts.appName.trim().toLowerCase();
  return {
    kind: 'prod-promote',
    name: `${appName}-prod-promote`,
    nameSpace,
    appName,
    siteId: null,
    imageDigest: opts.imageDigest.trim(),
    publishedPinSha: opts.publishedPinSha.trim(),
    credentialIds: [...opts.credentialIds],
    runsKubectl: false,
    runsSecurityAndPush: true,
  };
}

export function buildProdSiteJob(opts: {
  nameSpace: string;
  appName: string;
  siteId: string;
  imageDigest: string;
  publishedPinSha: string;
  credentialIds: string[];
}): ProdJobCreate {
  const nameSpace = opts.nameSpace.trim().toLowerCase();
  const appName = opts.appName.trim().toLowerCase();
  const siteId = opts.siteId.trim().toLowerCase();
  return {
    kind: 'prod-site',
    name: `${appName}-prod-${siteId}`,
    nameSpace,
    appName,
    siteId,
    imageDigest: opts.imageDigest.trim(),
    publishedPinSha: opts.publishedPinSha.trim(),
    credentialIds: [...opts.credentialIds],
    runsKubectl: true,
    runsSecurityAndPush: false,
  };
}

/** Path-end jobs: one prod-promote, plus only explicitly released Site kubectl jobs. */
export function prodJobsForPathEnd(opts: {
  nameSpace: string;
  appName: string;
  sites: string[];
  imageDigest: string;
  publishedPinSha: string;
  credentialIds: string[];
  releasedSites?: string[];
}): ProdJobCreate[] {
  const promote = buildProdPromoteJob(opts);
  const released = new Set((opts.releasedSites ?? []).map((s) => s.trim().toLowerCase()));
  const sites = opts.sites
    .map((s) => s.trim().toLowerCase())
    .filter((s) => released.has(s))
    .map((siteId) =>
      buildProdSiteJob({
        nameSpace: opts.nameSpace,
        appName: opts.appName,
        siteId,
        imageDigest: opts.imageDigest,
        publishedPinSha: opts.publishedPinSha,
        credentialIds: opts.credentialIds,
      }),
    );
  return [promote, ...sites];
}
