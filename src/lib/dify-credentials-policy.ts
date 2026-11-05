export type DifyCredentialValues = {
  baseUrl: string;
  apiKey: string;
  toolToken: string;
};

export type DifyCredentialSnapshot = DifyCredentialValues & {
  source: 'env' | 'override';
};

export function resolveDifyCredentials(opts: {
  env: DifyCredentialValues;
  override: DifyCredentialValues | null;
}): DifyCredentialSnapshot {
  if (opts.override) {
    return { ...opts.override, source: 'override' };
  }
  return { ...opts.env, source: 'env' };
}

/** Empty/whitespace secret fields mean leave the current secret unchanged. */
export function mergeDifyCredentialPatch(
  current: DifyCredentialValues,
  patch: Partial<DifyCredentialValues>,
): DifyCredentialValues {
  const nextBase = typeof patch.baseUrl === 'string' ? patch.baseUrl.trim() : current.baseUrl;
  const nextKey =
    typeof patch.apiKey === 'string' && patch.apiKey.trim()
      ? patch.apiKey.trim()
      : current.apiKey;
  const nextToken =
    typeof patch.toolToken === 'string' && patch.toolToken.trim()
      ? patch.toolToken.trim()
      : current.toolToken;
  return {
    baseUrl: nextBase || current.baseUrl,
    apiKey: nextKey,
    toolToken: nextToken,
  };
}
