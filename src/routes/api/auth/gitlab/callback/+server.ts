import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { base } from '$app/paths';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';
import { completeGitLabOAuthCallback } from '$lib/server/gitlab-oauth-flow';
import { normalizePublicOrigin } from '$lib/gitlab-settings-policy';
import { publicHref } from '$lib/kit-public-href';

function requestOrigin(url: URL, request: Request): string {
  const forwarded = request.headers.get('x-forwarded-proto');
  const proto = forwarded?.split(',')[0]?.trim() || url.protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  if (env.ORIGIN) return normalizePublicOrigin(env.ORIGIN);
  return normalizePublicOrigin(`${proto}://${host}`);
}

export const GET: RequestHandler = async ({ url, request }) => {
  const settings = await ensureAppLocalSettings();
  const result = await completeGitLabOAuthCallback({
    code: url.searchParams.get('code'),
    state: url.searchParams.get('state'),
    settings,
    publicOrigin: requestOrigin(url, request),
    publicBasePath: base,
  });
  if (!result.ok) {
    const q = new URLSearchParams({ gitlab: 'error', reason: result.error });
    throw redirect(303, publicHref(`/admin/account/me?${q}`));
  }
  throw redirect(303, publicHref('/admin/account/me?gitlab=connected'));
};
