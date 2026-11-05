import type { LayoutServerLoad } from './$types';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';
import { releaseNotesSnapshot } from '$lib/server/release-notes-snapshot';
import type { ReleaseNotesSnapshot } from '$lib/release-notes';

export const load: LayoutServerLoad = async ({ locals, url }) => {
  if (url.pathname === '/login' || !locals.operatorKey) {
    return {
      operator: null,
      currentSessionId: null as string | null,
      releaseNotes: null as ReleaseNotesSnapshot | null,
    };
  }
  const store = await ensureAppLocalSettings();
  const account = store.getOperatorAccount(locals.operatorKey);
  if (!account || account.disabled) {
    return {
      operator: null,
      currentSessionId: null as string | null,
      releaseNotes: null as ReleaseNotesSnapshot | null,
    };
  }
  return {
    operator: {
      username: account.username,
      displayName: account.displayName,
      role: account.role,
    },
    currentSessionId: locals.sessionId ?? null,
    releaseNotes: releaseNotesSnapshot(store, locals.operatorKey),
  };
};
