import { json } from '@sveltejs/kit';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import { env } from '$env/dynamic/private';
import { buildImageAllowlist, enrichDifySseReadableStream } from '$lib/server/dify-assistant-images-stream';
import { formatOrchestratorFetchError } from '$lib/dify-upstream-error';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';
import { canStartDiagnosisTurn } from '$lib/operator-role';
import { resolveModelRateTable } from '$lib/model-rate-table';

export async function POST({ request, locals }) {
  try {
    const store = await ensureAppLocalSettings();
    const operatorKey = locals.operatorKey ?? '';
    if (operatorKey) {
      const account = store.getOperatorAccount(operatorKey);
      if (!account || account.disabled || !canStartDiagnosisTurn(account.role)) {
        return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Viewer cannot start an AI Diagnosis turn'), {
          status: 403,
        });
      }
    }

    const { query, siteId, streaming, conversationId } = await request.json();
    if (!query) {
      return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'query is required'), { status: 400 });
    }

    const rates = resolveModelRateTable(store.getModelRateTable());
    return await proxyLangGraphOrchestrator({
      query,
      siteId,
      streaming: Boolean(streaming),
      conversationId,
      operatorUsername: operatorKey || '',
      modelRates: rates,
    });
  } catch (e) {
    const baseUrl = (env.ORCH_BASE_URL || 'http://127.0.0.1:3200').replace(/\/+$/, '');
    return json(createErrorResponse(ErrorCode.UPSTREAM_ERROR, formatOrchestratorFetchError(baseUrl, e)), {
      status: 502,
    });
  }
}

async function proxyLangGraphOrchestrator(opts: {
  query: string;
  siteId?: string;
  streaming: boolean;
  conversationId?: string;
  operatorUsername: string;
  modelRates: Record<string, { inputUsdPerMillion: number; outputUsdPerMillion: number }>;
}) {
  const baseUrl = (env.ORCH_BASE_URL || 'http://127.0.0.1:3200').replace(/\/+$/, '');
  const allowlist = buildImageAllowlist({
    mediaBaseUrl: env.AIBRIDGE_BASE_URL,
    allowlistEnv: env.NEXTOPS_IMAGE_ALLOWLIST,
  });
  const res = await fetch(`${baseUrl}/diagnose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: opts.query,
      siteId: opts.siteId ?? '',
      conversationId: typeof opts.conversationId === 'string' ? opts.conversationId : '',
      streaming: opts.streaming,
      operatorUsername: opts.operatorUsername,
      modelRates: opts.modelRates,
    }),
  });
  if (!res.ok) {
    return json(createErrorResponse(ErrorCode.UPSTREAM_ERROR, 'LangGraph orchestrator request failed'), {
      status: 502,
    });
  }
  if (opts.streaming) {
    if (!res.body) {
      return json(
        createErrorResponse(ErrorCode.UPSTREAM_ERROR, 'LangGraph orchestrator returned empty body'),
        { status: 502 },
      );
    }
    const enriched = enrichDifySseReadableStream(res.body, allowlist);
    return new Response(enriched, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }
  const data = await res.json();
  return json({
    answer: data.answer ?? '',
    conversationId: data.conversation_id ?? data.conversationId ?? '',
    assistantImages: { images: [], blocked: [], truncated: false },
  });
}