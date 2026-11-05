import { error } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { registerError, clearError } from '$lib/server/diagnosis';
import { elasticsearchHeaders } from '$lib/server/es-basic-headers';
import { resolveLogIndexForSite } from '$lib/server/log-index-resolve';
import {
  buildCategoryRuleEsClauses,
  buildDocumentFilterClauses,
  parseDocumentFiltersParam,
  type CategoryRule,
} from '$lib/log-document-filter';
import { SITE_CONFIGS } from '$lib/site-config';

/**
 * Smart Logging SSE (ADR-0004 transport + ADR-0021 filters).
 * Requires active Log Index Pattern (`index`). Document Filters via `documentFilters` JSON.
 * Dedicated namespace/pod/level query params are ignored (use Document Filters).
 */
export async function GET({ url, fetch }) {
  const esUrl = privateEnv.ES_BASE_URL || 'http://localhost:9200';

  const siteId = url.searchParams.get('siteId')?.trim() ?? '';
  if (!siteId) {
    throw error(400, 'siteId is required');
  }
  if (!SITE_CONFIGS[siteId]) {
    throw error(404, `Site not found: ${siteId}`);
  }

  const indexParam = url.searchParams.get('index')?.trim() ?? '';
  if (!indexParam) {
    throw error(400, 'index (active Log Index Pattern) is required');
  }

  const timeFrom = url.searchParams.get('timeFrom') ?? new Date(Date.now() - 3600000).toISOString();
  const timeTo = url.searchParams.get('timeTo') ?? new Date().toISOString();
  const keyword = url.searchParams.get('keyword') || '*';
  const interval = parseInt(url.searchParams.get('interval') ?? '3', 10);
  const clampedInterval = Math.max(1, Math.min(60, interval)) * 1000;

  const docParsed = parseDocumentFiltersParam(url.searchParams.get('documentFilters'));
  if (!docParsed.ok) throw error(400, docParsed.message);
  const docFilters = buildDocumentFilterClauses(docParsed.filters);

  let categoryMust: object[] = [];
  let categoryFilter: object[] = [];
  const categoryRuleRaw = url.searchParams.get('categoryRule');
  if (categoryRuleRaw) {
    try {
      const rule = JSON.parse(categoryRuleRaw) as CategoryRule;
      const built = buildCategoryRuleEsClauses(rule);
      categoryMust = built.must;
      categoryFilter = built.filter;
    } catch {
      throw error(400, 'categoryRule must be JSON');
    }
  }

  const resolved = resolveLogIndexForSite({
    siteId,
    mode: SITE_CONFIGS[siteId].defaultLogMode ?? 'k8s',
    index: indexParam,
    timeFrom,
    timeTo,
  });

  if (!resolved.ok) {
    const status = resolved.code === 'FACTORY_CODE_MISSING' ? 422 : 400;
    throw error(status, resolved.message);
  }

  const logIndex = resolved.index;

  const stream = new ReadableStream({
    async start(controller) {
      let cursor: any[] | null = null;
      let isFirstRun = true;
      let closed = false;

      const safeEnqueue = (data: string) => {
        if (!closed) {
          try {
            controller.enqueue(data);
          } catch {
            closed = true;
          }
        }
      };

      const poll = async () => {
        if (closed) return;
        try {
          const esQuery = {
            query: {
              bool: {
                must: [{ query_string: { query: keyword } }, ...categoryMust],
                filter: [
                  { range: { '@timestamp': { gte: timeFrom, lte: timeTo } } },
                  ...docFilters,
                  ...categoryFilter,
                ],
              },
            },
            sort: [
              { '@timestamp': 'desc' },
              { _id: 'desc' },
            ],
            size: isFirstRun ? 100 : 50,
            search_after: cursor ?? undefined,
          };

          let hits: any[] = [];
          let total = 0;
          try {
            const res = await fetch(`${esUrl}/${logIndex}/_search`, {
              method: 'POST',
              headers: elasticsearchHeaders(),
              body: JSON.stringify(esQuery),
            });
            if (res.ok) {
              const data = await res.json();
              hits = data.hits?.hits ?? [];
              total = data.hits?.total?.value ?? 0;
              clearError('Elasticsearch');
            } else {
              registerError(
                'Elasticsearch',
                `ES stream poll failed with status ${res.status}: ${res.statusText}`,
                `Index: ${logIndex}`,
              );
            }
          } catch (e: any) {
            const msg = e instanceof Error ? e.message : String(e);
            registerError('Elasticsearch', msg, e instanceof Error ? e.stack : undefined);
          }

          if (isFirstRun) {
            safeEnqueue(
              `event: snapshot\ndata: ${JSON.stringify({ hits, cursor: hits[hits.length - 1]?.sort, total })}\n\n`,
            );
            isFirstRun = false;
          } else {
            for (const hit of hits) {
              safeEnqueue(`event: log\ndata: ${JSON.stringify(hit)}\n\n`);
            }
          }

          if (hits.length > 0) {
            cursor = hits[hits.length - 1].sort;
          }

          safeEnqueue(
            `event: heartbeat\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`,
          );
        } catch {
          // ignore poll errors after stream closed
        }
      };

      async function schedulePoll() {
        if (closed) return;
        await poll();
        if (!closed) {
          setTimeout(schedulePoll, clampedInterval);
        }
      }

      await poll();
      const timer = setTimeout(schedulePoll, clampedInterval);

      return {
        cancel() {
          closed = true;
          clearTimeout(timer);
        },
      };
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
