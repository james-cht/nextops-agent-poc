import { kitPathsBase } from '../public-base-path.ts';

/**
 * Session cookie flags for login.
 * Never force Secure from NODE_ENV or from SvelteKit `url.protocol` alone —
 * adapter-node's get_origin() defaults protocol to https when ORIGIN is unset,
 * so production on plain HTTP (e.g. http://10.x.x.x:3003) would set a Secure
 * cookie the browser will not store or send back.
 */
export function sessionCookieSecure(opts: {
  /** Ignored. adapter-node may report https: on a plain HTTP socket. */
  requestProtocol?: string;
  forwardedProto?: string | null;
  originEnv?: string | null;
}): boolean {
  const forwarded = (opts.forwardedProto ?? '').split(',')[0]?.trim().toLowerCase();
  if (forwarded === 'https') return true;
  if (forwarded === 'http') return false;
  const origin = (opts.originEnv ?? '').trim().toLowerCase();
  if (origin.startsWith('https://')) return true;
  return false;
}

export function sessionCookieOptions(opts: {
  requestProtocol?: string;
  forwardedProto?: string | null;
  originEnv?: string | null;
  publicBasePath?: string | null;
  maxAgeSec?: number;
}): {
  path: string;
  httpOnly: boolean;
  sameSite: 'strict';
  secure: boolean;
  maxAge: number;
} {
  return {
    path: kitPathsBase(opts.publicBasePath) || '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: sessionCookieSecure(opts),
    maxAge: opts.maxAgeSec ?? 60 * 60 * 24,
  };
}
