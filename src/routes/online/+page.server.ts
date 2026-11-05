import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { publicHref } from '$lib/kit-public-href';
import {
  applicationOnlineEmptyState,
  canOpenApplicationOnline,
  canWriteApplicationOnline,
} from '$lib/application-online';
import { listApplicationOnlineHome } from '$lib/server/application-online-actions';
import { getApplicationOnlineStore } from '$lib/server/application-online-store';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.operatorKey) throw redirect(303, publicHref('/login'));
  const settings = await ensureAppLocalSettings();
  const account = settings.getOperatorAccount(locals.operatorKey);
  if (!account || account.disabled || !canOpenApplicationOnline(account.role)) {
    throw redirect(303, publicHref('/'));
  }
  const home = listApplicationOnlineHome({
    store: getApplicationOnlineStore(),
    account,
    developerAccounts: settings.listOperatorAccounts(),
  });
  return {
    empty: applicationOnlineEmptyState(account.role),
    canWrite: canWriteApplicationOnline(account.role),
    canManageMembership: home.canManageMembership,
    projects: home.projects,
    developerCandidates: home.developerCandidates,
    baseImages: home.baseImages,
  };
};
