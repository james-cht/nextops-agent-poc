/** Pure MySQL proxy policy (no SvelteKit env imports — unit-test friendly). */

export function resolveMysqlProxyEnabled(opts: {
  flag: boolean;
  proxyHost: string;
  proxyPort: string;
}): boolean {
  return opts.flag === true && !!opts.proxyHost && !!opts.proxyPort;
}
