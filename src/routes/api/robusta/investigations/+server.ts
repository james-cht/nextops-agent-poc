import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { getSiteCatalogEntry } from '$lib/server/site-catalog';
import { recordUpstreamDiagnostic } from '$lib/server/upstream-diagnostic';
import { clearError } from '$lib/server/diagnosis';
import { isMysqlProxyEnabled } from '$lib/server/mysql-proxy';
import {
  RobustaStoreNotConfiguredError,
  listRobustaInvestigations,
} from '$lib/server/robusta-store';
import { isRobustaStoreConfigured, robustaStoreConfigGapMessage } from '$lib/server/robusta-mysql';
import {
  ROBUSTA_HISTORY_PAGE_SIZE,
  parseRobustaHistoryKindFilter,
  parseRobustaHistoryPage,
  parseRobustaHistoryWindowHours,
  siteHasRobustaHistory,
} from '$lib/robusta-history';

export const GET: RequestHandler = async ({ url }) => {
  const siteId = url.searchParams.get('siteId')?.trim() ?? '';
  if (!siteId) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'siteId is required'), { status: 400 });
  }
  const site = getSiteCatalogEntry(siteId);
  if (!site) {
    return json(createErrorResponse(ErrorCode.NOT_FOUND, `Site not found: ${siteId}`), { status: 404 });
  }

  const windowHours = parseRobustaHistoryWindowHours(url.searchParams.get('windowHours'));
  const page = parseRobustaHistoryPage(url.searchParams.get('page'));
  const kindFilter = parseRobustaHistoryKindFilter(
    url.searchParams.get('kind'),
    url.searchParams.get('cpuSuccess'),
  );

  if (!siteHasRobustaHistory(site)) {
    return json({
      deployed: false,
      siteId,
      windowHours,
      page,
      pageSize: ROBUSTA_HISTORY_PAGE_SIZE,
      kind: kindFilter?.kind ?? null,
      cpuSuccess: kindFilter?.cpuSuccess ?? false,
      total: 0,
      items: [],
    });
  }

  if (!isRobustaStoreConfigured()) {
    const message = robustaStoreConfigGapMessage();
    recordUpstreamDiagnostic({
      service: 'Robusta Store',
      message,
      dependency: 'MySQL',
      siteId,
      proxyEnabled: isMysqlProxyEnabled(),
    });
    return json(createErrorResponse(ErrorCode.UPSTREAM_ERROR, message), { status: 502 });
  }

  try {
    const { total, items } = await listRobustaInvestigations({
      clusterKey: site.robustaClusterKey,
      windowHours,
      page,
      kindFilter,
    });
    clearError('Robusta Store');
    return json({
      deployed: true,
      siteId,
      windowHours,
      page,
      pageSize: ROBUSTA_HISTORY_PAGE_SIZE,
      kind: kindFilter?.kind ?? null,
      cpuSuccess: kindFilter?.cpuSuccess ?? false,
      total,
      items,
    });
  } catch (e) {
    if (e instanceof RobustaStoreNotConfiguredError) {
      return json(
        createErrorResponse(ErrorCode.UPSTREAM_ERROR, e.message),
        { status: 502 },
      );
    }
    const msg = e instanceof Error ? e.message : 'Unknown error';
    recordUpstreamDiagnostic({
      service: 'Robusta Store',
      message: msg,
      dependency: 'MySQL',
      siteId,
      proxyEnabled: isMysqlProxyEnabled(),
    });
    return json(createErrorResponse(ErrorCode.UPSTREAM_ERROR, msg), { status: 502 });
  }
};
