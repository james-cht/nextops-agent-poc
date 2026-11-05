export function isProductionProxyMisconfiguration(
  nodeEnv: string | undefined,
  proxyEnabled: boolean,
): boolean {
  return nodeEnv === 'production' && proxyEnabled;
}
