import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listConfigAuditEntries } from '$lib/server/config-audit-log';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';

export const GET: RequestHandler = async ({ url }) => {
  const store = await ensureAppLocalSettings();
  const limitRaw = Number(url.searchParams.get('limit') ?? '100');
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
  return json({ entries: listConfigAuditEntries({ store, limit }) });
};
