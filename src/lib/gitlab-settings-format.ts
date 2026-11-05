import { maskSecret } from './dify-credentials-format.ts';
import { gitlabOAuthRedirectUri } from './gitlab-settings-policy.ts';

export type GitLabSettingsAdminPayload = {
  oauth: {
    baseUrl: string;
    clientId: string;
    clientSecretMasked: string;
    clientSecretSet: boolean;
  };
  readAccess: {
    tokenMasked: string;
    tokenSet: boolean;
  };
  /** Derived from NextOps public origin — not a Runtime Setting. */
  oauthRedirectUri: string;
};

export function toGitLabSettingsAdminPayload(opts: {
  oauth: { baseUrl: string; clientId: string; clientSecret: string } | null;
  readAccess: { token: string } | null;
  publicOrigin: string;
  publicBasePath?: string | null;
}): GitLabSettingsAdminPayload {
  return {
    oauth: {
      baseUrl: opts.oauth?.baseUrl ?? '',
      clientId: opts.oauth?.clientId ?? '',
      clientSecretMasked: opts.oauth?.clientSecret ? maskSecret(opts.oauth.clientSecret) : '',
      clientSecretSet: Boolean(opts.oauth?.clientSecret),
    },
    readAccess: {
      tokenMasked: opts.readAccess?.token ? maskSecret(opts.readAccess.token) : '',
      tokenSet: Boolean(opts.readAccess?.token),
    },
    oauthRedirectUri: gitlabOAuthRedirectUri(opts.publicOrigin, opts.publicBasePath),
  };
}
