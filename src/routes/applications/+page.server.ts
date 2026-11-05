import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { publicHref } from '$lib/kit-public-href';
import { applicationCatalogEmptyState } from '$lib/application-catalog';
import type { OperatorRole } from '$lib/operator-role';
import { listApplicationCatalog } from '$lib/server/application-catalog-list';
import { getApplicationStore } from '$lib/server/application-store';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';

export const load: PageServerLoad = async ({ parent, fetch }) => {
  const { operator } = await parent();
  if (!operator?.role) throw redirect(303, publicHref('/login'));
  const role = operator.role as OperatorRole;

  const res = await fetch('/api/applications');
  if (res.ok) {
    const data = (await res.json()) as {
      applications?: Array<{
        name: string;
        gitlabProjectPath: string;
        registeredByUsername: string;
        registeredAt: string;
      }>;
    };
    return {
      empty: applicationCatalogEmptyState(role),
      applications: data.applications ?? [],
    };
  }

  // Fallback for non-HTTP load contexts (tests): read stores directly.
  const settings = await ensureAppLocalSettings();
  const listed = listApplicationCatalog({
    operatorKey: operator.username,
    settings,
    apps: getApplicationStore(),
  });
  return {
    empty: applicationCatalogEmptyState(role),
    applications: listed.ok ? listed.applications : [],
  };
};
