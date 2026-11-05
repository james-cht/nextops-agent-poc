export function resolveClientIp(opts: {
  peer: string;
  forwardedFor?: string | null;
  trustedProxy: boolean;
}): string {
  const peer = opts.peer.trim() || '0.0.0.0';
  if (!opts.trustedProxy) return peer;
  const first = (opts.forwardedFor ?? '').split(',')[0]?.trim();
  return first || peer;
}
