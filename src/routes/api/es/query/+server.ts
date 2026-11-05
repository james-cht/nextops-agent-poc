import { json } from '@sveltejs/kit';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { env as privateEnv } from '$env/dynamic/private';
import { registerError, clearError } from '$lib/server/diagnosis';
import { elasticsearchHeaders } from '$lib/server/es-basic-headers';
import { resolveLogIndexForSite } from '$lib/server/log-index-resolve';
import { buildLogK8sDocFilters, normalizeLogK8sScope } from '$lib/log-k8s-scope';
import {
  buildCategoryRuleEsClauses,
  buildDocumentFilterClauses,
  parseDocumentFiltersParam,
  type CategoryRule,
} from '$lib/log-document-filter';
import { SITE_CONFIGS } from '$lib/site-config';

export async function POST({ request, fetch }) {
  try {
    const esUrl = privateEnv.ES_BASE_URL || 'http://localhost:9200';
    const body = await request.json();
    const {
      index,
      query,
      timeFrom,
      timeTo,
      size = 100,
      searchAfter,
      siteId,
      mode,
      namespace,
      pod,
      level,
      documentFilters,
      categoryRule,
    } = body;

    if (!query) {
      return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'query is required'), { status: 400 });
    }

    if (!siteId || typeof siteId !== 'string') {
      return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'siteId is required'), { status: 400 });
    }

    if (!SITE_CONFIGS[siteId]) {
      return json(createErrorResponse(ErrorCode.NOT_FOUND, `Site not found: ${siteId}`), {
        status: 404,
      });
    }

    const effectiveMode = mode ?? SITE_CONFIGS[siteId].defaultLogMode ?? 'k8s';
    const scope = normalizeLogK8sScope({ mode: effectiveMode, namespace, pod });
    if (!scope.ok) {
      return json(createErrorResponse(ErrorCode.BAD_REQUEST, scope.message), { status: 400 });
    }

    const resolved = resolveLogIndexForSite({
      siteId,
      mode,
      index: typeof index === 'string' ? index : undefined,
      timeFrom,
      timeTo,
    });

    if (!resolved.ok) {
      const code =
        resolved.code === 'FACTORY_CODE_MISSING'
          ? ErrorCode.FACTORY_CODE_MISSING
          : ErrorCode.INVALID_INDEX;
      const status = resolved.code === 'FACTORY_CODE_MISSING' ? 422 : 400;
      return json(createErrorResponse(code, resolved.message), { status });
    }

    const filters = [];

    if (timeFrom || timeTo) {
      filters.push({
        range: {
          '@timestamp': {
            ...(timeFrom && { gte: timeFrom }),
            ...(timeTo && { lte: timeTo }),
          },
        },
      });
    }

    if (level) {
      const levelTerms = Array.isArray(level) ? level : [level];
      filters.push({ terms: { level: levelTerms } });
    }

    filters.push(...buildLogK8sDocFilters(scope));

    const docParsed = parseDocumentFiltersParam(
      typeof documentFilters === 'string'
        ? documentFilters
        : documentFilters != null
          ? JSON.stringify(documentFilters)
          : '[]',
    );
    if (!docParsed.ok) {
      return json(createErrorResponse(ErrorCode.BAD_REQUEST, docParsed.message), { status: 400 });
    }
    filters.push(...buildDocumentFilterClauses(docParsed.filters));

    const must: object[] = [{ query_string: { query } }];
    if (categoryRule && typeof categoryRule === 'object') {
      const built = buildCategoryRuleEsClauses(categoryRule as CategoryRule);
      must.push(...built.must);
      filters.push(...built.filter);
    }

    const esQuery = {
      query: {
        bool: {
          must,
          filter: filters,
        },
      },
      sort: [
        { '@timestamp': 'desc' },
        { _id: 'desc' },
      ],
      size: Math.min(size, 1000),
      search_after: searchAfter ?? undefined,
    };

    const res = await fetch(`${esUrl}/${resolved.index}/_search`, {
      method: 'POST',
      headers: elasticsearchHeaders(),
      body: JSON.stringify(esQuery),
    });

    if (!res.ok) {
      const errorMsg = `ES query failed with status ${res.status}: ${res.statusText}`;
      registerError('Elasticsearch', errorMsg, `URL: ${esUrl}/${resolved.index}/_search`);
      return json(
        createErrorResponse(ErrorCode.UPSTREAM_ERROR, `ES query failed: ${res.statusText}`),
        { status: 502 },
      );
    }

    clearError('Elasticsearch');

    const data = await res.json();
    const rawHits: any[] = data.hits?.hits ?? [];
    const total = data.hits?.total?.value ?? 0;
    const lastHit = rawHits[rawHits.length - 1];
    const cursor = lastHit ? lastHit.sort : null;

    return json({
      hits: rawHits.map((hit: any) => ({
        _id: hit._id,
        _source: hit._source,
        sort: hit.sort,
      })),
      cursor,
      total,
      index: resolved.index,
    });
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    registerError('Elasticsearch', msg, e instanceof Error ? e.stack : undefined);
    return json(
      createErrorResponse(ErrorCode.INTERNAL_ERROR, `Internal server error: ${msg}`),
      { status: 500 },
    );
  }
}
