import { redirect } from '@sveltejs/kit';
import { publicHref } from '$lib/kit-public-href';

export function load() {
  redirect(302, publicHref('/admin/sources'));
}
