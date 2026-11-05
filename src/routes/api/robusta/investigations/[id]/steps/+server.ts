import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { getSiteCatalogEntry } from '$lib/server/site-catalog';
import { recordUpstreamDiagnostic } from '$lib/server/upstream-diagnostic';
import { clearError } from '$lib/server/diagnosis';
import { isMysqlProxyEnabled } from '$lib/server/mysql-proxy';
import {
  RobustaStoreNotConfiguredError,
  listRobustaInvestigationSteps,
} from '$lib/server/robusta-store';
import { isRobustaStoreConfigured, robustaStoreConfigGapMessage } from '$lib/server/robusta-mysql';
import { siteHasRobustaHistory } from '$lib/robusta-history';

export const GET: RequestHandler = async ({ params, url }) => {
  const siteId = url.searchParams.get('siteId')?.trim() ?? '';
  const investigationId = params.id?.trim() ?? '';
  if (!siteId || !investigationId) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'siteId and investigation id are required'), {
      status: 400,
    });
  }
  const site = getSiteCatalogEntry(siteId);
  if (!site) {
    return json(createErrorResponse(ErrorCode.NOT_FOUND, `Site not found: ${siteId}`), { status: 404 });
  }
  if (!siteHasRobustaHistory(site)) {
    return json(createErrorResponse(ErrorCode.NOT_FOUND, 'Robusta is not deployed on this Site'), {
      status: 404,
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
    const steps = await listRobustaInvestigationSteps({
      investigationId,
      clusterKey: site.robustaClusterKey,
    });
    clearError('Robusta Store');
    return json({ investigationId, steps });
  } catch (e) {
    if (e instanceof RobustaStoreNotConfiguredError) {
      return json(createErrorResponse(ErrorCode.UPSTREAM_ERROR, e.message), { status: 502 });
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
