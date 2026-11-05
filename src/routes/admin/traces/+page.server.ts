import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';
import { canViewDiagnosisTraces } from '$lib/operator-role';

export const load: PageServerLoad = async ({ locals }) => {
  const store = await ensureAppLocalSettings();
  const account = store.getOperatorAccount(locals.operatorKey ?? '');
  if (!canViewDiagnosisTraces(account?.role)) {
    error(403, '僅 Platform Owner 可檢視診斷鏈條');
  }
  return {};
};
