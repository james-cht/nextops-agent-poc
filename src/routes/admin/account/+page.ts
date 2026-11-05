import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { publicHref } from '$lib/kit-public-href';

export const load: PageLoad = async ({ parent }) => {
  const data = await parent();
  const role = (data as { operator?: { role?: string } | null }).operator?.role;
  if (role && role !== 'platform_owner') {
    throw redirect(303, publicHref('/admin/account/me'));
  }
  return {};
};
