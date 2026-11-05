import { joinPublicPath } from './public-base-path.ts';

export type GitLabOAuthClientValues = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
};

export type GitLabReadAccessValues = {
  token: string;
};

/** Normalize NextOps public ORIGIN: trim, strip wrapping quotes, drop trailing slash. */
export function normalizePublicOrigin(publicOrigin: string): string {
  let origin = publicOrigin.trim();
  if (
    (origin.startsWith('"') && origin.endsWith('"')) ||
    (origin.startsWith("'") && origin.endsWith("'"))
  ) {
    origin = origin.slice(1, -1).trim();
  }
  return origin.replace(/\/$/, '');
}

/** OAuth redirect follows NextOps public URL — not a Runtime Setting. */
export function gitlabOAuthRedirectUri(
  publicOrigin: string,
  publicBasePath: string | undefined | null = '',
): string {
  return `${normalizePublicOrigin(publicOrigin)}${joinPublicPath(publicBasePath, '/api/auth/gitlab/callback')}`;
}

/** Empty/whitespace secret fields mean leave the current secret unchanged. */
export function mergeGitLabOAuthClientPatch(
  current: GitLabOAuthClientValues,
  patch: Partial<GitLabOAuthClientValues>,
): GitLabOAuthClientValues {
  const baseUrl =
    typeof patch.baseUrl === 'string' && patch.baseUrl.trim()
      ? patch.baseUrl.trim().replace(/\/$/, '')
      : current.baseUrl;
  const clientId =
    typeof patch.clientId === 'string' && patch.clientId.trim()
      ? patch.clientId.trim()
      : current.clientId;
  const clientSecret =
    typeof patch.clientSecret === 'string' && patch.clientSecret.trim()
      ? patch.clientSecret.trim()
      : current.clientSecret;
  return { baseUrl, clientId, clientSecret };
}

export function mergeGitLabReadAccessPatch(
  current: GitLabReadAccessValues,
  patch: Partial<GitLabReadAccessValues>,
): GitLabReadAccessValues {
  const raw =
    typeof patch.token === 'string' && patch.token.trim() ? patch.token.trim() : current.token;
  const token = raw.replace(/^bearer\s+/i, '').trim();
  return { token };
}
