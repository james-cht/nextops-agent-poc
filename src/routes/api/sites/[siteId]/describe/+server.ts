import { json } from '@sveltejs/kit';
import { getSiteDiagnosisContext } from '$lib/server/site-catalog';
import { ErrorCode, createErrorResponse } from '$lib/errors';

export function GET({ params }) {
  try {
    const site = getSiteDiagnosisContext(params.siteId);
    if (!site) {
      return json(createErrorResponse(ErrorCode.NOT_FOUND, 'Site not found'), { status: 404 });
    }

    return json({
      siteId: site.siteId,
      clusterTag: site.clusterTag,
      factoryCode: site.factoryCode,
      defaultLogMode: site.defaultLogMode,
      hostTypes: site.hostTypes,
      esIndices: site.esIndices,
      prometheusMetrics: site.prometheusMetrics,
      loggingAvailable: Boolean(site.factoryCode),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return json(createErrorResponse(ErrorCode.INTERNAL_ERROR, msg), { status: 500 });
  }
}
