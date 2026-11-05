import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { base } from '$app/paths';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';
import { attemptPasswordLogin } from '$lib/server/operator-auth';
import { resolveClientIp } from '$lib/server/client-ip';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { sessionCookieOptions } from '$lib/server/session-cookie';

function trustedProxy(): boolean {
  const v = (env.NEXTOPS_TRUSTED_PROXY ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  try {
    const { username, password, totpCode } = await request.json();
    const store = await ensureAppLocalSettings();
    const clientIp = resolveClientIp({
      peer: getClientAddress(),
      forwardedFor: request.headers.get('x-forwarded-for'),
      trustedProxy: trustedProxy(),
    });
    const result = await attemptPasswordLogin(store, {
      username: String(username ?? ''),
      password: String(password ?? ''),
      totpCode: totpCode != null ? String(totpCode) : undefined,
      clientIp,
      userAgent: request.headers.get('user-agent'),
    });
    if (!result.ok) {
      const status = result.code === 'LOCKED' ? 429 : 401;
      const code = result.code === 'LOCKED' ? ErrorCode.RATE_LIMITED : ErrorCode.UNAUTHORIZED;
      const message =
        result.code === 'LOCKED' ? 'Login temporarily locked' : 'Invalid credentials';
      return json(createErrorResponse(code, message), { status });
    }
    cookies.set(
      'session',
      result.session.id,
      sessionCookieOptions({
        forwardedProto: request.headers.get('x-forwarded-proto'),
        originEnv: env.ORIGIN,
        publicBasePath: base,
      }),
    );
    return json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, msg), { status: 400 });
  }
};
