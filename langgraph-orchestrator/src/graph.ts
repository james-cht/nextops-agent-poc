import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { geAgentChat } from './ge-agent.ts';
import type { ConversationRecord, ConversationStore } from './conversations.ts';
import { summarizeTurns } from './conversations.ts';
import { matchCatalogSiteId, NextOpsClient, type ToolFetchResult } from './nextops-client.ts';
import type { OrchestratorSettingsStore } from './settings.ts';
import type { DiagnosisTrace, TraceObservation, TraceStore } from './traces.ts';
import { buildTraceUsage, truncateField, type ModelRate } from './usage.ts';

const GraphState = Annotation.Root({
  query: Annotation<string>(),
  siteId: Annotation<string>(),
  conversationId: Annotation<string>(),
  conversation: Annotation<ConversationRecord | null>(),
  sitesJson: Annotation<string>(),
  resolvedSiteId: Annotation<string>(),
  overviewJson: Annotation<string>(),
  healthJson: Annotation<string>(),
  describeJson: Annotation<string>(),
  answer: Annotation<string>(),
  error: Annotation<string>(),
  systemPrompt: Annotation<string>(),
  gatewayQuestion: Annotation<string>(),
  gatewayRaw: Annotation<string>(),
  model: Annotation<string>(),
  employeeId: Annotation<string>(),
  operatorUsername: Annotation<string>(),
  observations: Annotation<TraceObservation[]>({
    default: () => [],
    reducer: (left, right) => [...left, ...right],
  }),
});

export type DiagnoseRequest = {
  query: string;
  siteId?: string;
  conversationId?: string;
  operatorUsername?: string;
  modelRates?: Record<string, ModelRate>;
};

export type DiagnoseResult = {
  answer: string;
  conversationId: string;
  siteId: string;
};

function toolObservation(
  name: string,
  path: string,
  res: ToolFetchResult,
  startedAt: string,
): TraceObservation {
  const body = truncateField(res.bodyText);
  return {
    kind: 'tool_endpoint',
    name,
    truncated: body.truncated,
    payload: { path, status: res.status, body: body.value },
    startedAt,
    endedAt: new Date().toISOString(),
    status: res.status,
  };
}

function persistTraceFailOpen(store: TraceStore | undefined, trace: DiagnosisTrace): void {
  if (!store) return;
  try {
    store.put(trace);
  } catch {
    /* ADR-0024 fail-open */
  }
}

export function createDiagnosisGraph(deps: {
  tools: NextOpsClient;
  conversations: ConversationStore;
  settings: OrchestratorSettingsStore;
  aibridgeBaseUrl: string;
  fetchTimeoutMs: number;
  traces?: TraceStore;
  geAgentProject?: string;
  geAgentLocation?: string;
  geAgentEngine?: string;
  geAgentId?: string;
  geAgentAccessToken?: string;
}) {
  const graph = new StateGraph(GraphState)
    .addNode('loadConversation', (state) => {
      const id = state.conversationId || crypto.randomUUID();
      const conversation = deps.conversations.get(id);
      return { conversationId: id, conversation };
    })
    .addNode('resolveSite', async (state) => {
      if (state.siteId?.trim()) return { resolvedSiteId: state.siteId.trim() };
      const startedAt = new Date().toISOString();
      const listed = await deps.tools.listSites();
      if (!listed.ok) {
        return {
          error: `list_sites failed (${listed.status})`,
          observations: [toolObservation('list_sites', '/api/sites', listed, startedAt)],
        };
      }
      const resolved = matchCatalogSiteId(state.query, listed.bodyText);
      return {
        sitesJson: listed.bodyText,
        resolvedSiteId: resolved || '',
        observations: [toolObservation('list_sites', '/api/sites', listed, startedAt)],
      };
    })
    .addNode('fetchHealth', async (state) => {
      if (state.error || !state.resolvedSiteId) return {};
      const startedAt = new Date().toISOString();
      const path = `/api/sites/${encodeURIComponent(state.resolvedSiteId)}/resource-health`;
      const res = await deps.tools.getSiteResourceHealth(state.resolvedSiteId);
      return {
        healthJson: res.bodyText,
        observations: [toolObservation('get_site_resource_health', path, res, startedAt)],
      };
    })
    .addNode('fetchOverview', async (state) => {
      if (state.error || !state.resolvedSiteId) return {};
      const startedAt = new Date().toISOString();
      const path = `/api/sites/${encodeURIComponent(state.resolvedSiteId)}/overview`;
      const res = await deps.tools.getSiteOverview(state.resolvedSiteId);
      return {
        overviewJson: res.bodyText,
        observations: [toolObservation('get_site_overview', path, res, startedAt)],
      };
    })
    .addNode('fetchDescribe', async (state) => {
      if (state.error || !state.resolvedSiteId) return {};
      const startedAt = new Date().toISOString();
      const path = `/api/sites/${encodeURIComponent(state.resolvedSiteId)}/describe`;
      const res = await deps.tools.describeSite(state.resolvedSiteId);
      return {
        describeJson: res.bodyText,
        observations: [toolObservation('describe_site', path, res, startedAt)],
      };
    })
    .addNode('callAiBridge', async (state) => {
      if (state.error) return { answer: `無法完成診斷：${state.error}` };
      const settings = deps.settings.get();
      if (!deps.geAgentProject || !deps.geAgentEngine || !deps.geAgentId) {
        return { answer: '無法完成診斷：GE Agent 尚未設定。', error: 'missing_ge_agent' };
      }
      const systemPrompt = [
        '你是 NextOps Diagnosis Orchestrator。',
        '請使用提供的站點資料進行根因分析與可執行建議。',
        '回答語言請用繁體中文。',
        '標題用 markdown # / ##，表格用 markdown table，短句用獨立行「重點：」「提示：」「風險：」「建議：」。不要用 **粗體** 當標題。',
        '若使用者要求健康或 RCA 報告：先寫視覺摘要，再以恰好為「詳細資料」的標題開啟附錄（可省略附錄）。',
        '若站點未解析到，先給一般排障建議，再提醒使用者指定站點。',
      ].join('\n');
      const historyBefore = JSON.stringify(state.conversation?.turns ?? []);
      const historyAfter = summarizeTurns([
        ...(state.conversation?.turns ?? []),
        { role: 'user', content: state.query },
      ]);
      const context = [
        `siteId=${state.resolvedSiteId || '(unbound)'}`,
        `sites=${state.sitesJson || '[]'}`,
        `describe=${state.describeJson || '{}'}`,
        `overview=${state.overviewJson || '{}'}`,
        `resource_health=${state.healthJson || '{}'}`,
        `history=${historyAfter}`,
      ].join('\n\n');
      const question = `${state.query}\n\n[CONTEXT]\n${context}`;
      const message = `${systemPrompt}\n\n${question}`;
      const before = truncateField(historyBefore);
      const after = truncateField(historyAfter);
      const reductionStarted = new Date().toISOString();
      const reduction: TraceObservation = {
        kind: 'context_reduction',
        name: 'context_reduction',
        truncated: before.truncated || after.truncated,
        payload: { before: before.value, after: after.value },
        startedAt: reductionStarted,
        endedAt: new Date().toISOString(),
      };

      const gwStarted = new Date().toISOString();
      const ai = await geAgentChat({
        projectId: deps.geAgentProject,
        location: deps.geAgentLocation || 'global',
        engineId: deps.geAgentEngine,
        agentId: deps.geAgentId,
        message,
        timeoutMs: deps.fetchTimeoutMs,
        accessToken: deps.geAgentAccessToken || undefined,
      });
      const sys = truncateField(systemPrompt);
      const q = truncateField(question);
      const resp = truncateField(ai.content);
      const gateway: TraceObservation = {
        kind: 'aibridge_gateway',
        name: 'aibridge_unified_chat',
        truncated: sys.truncated || q.truncated || resp.truncated,
        payload: {
          model: settings.model,
          employeeId: settings.employeeId,
          systemPrompt: sys.value,
          question: q.value,
          response: resp.value,
          status: ai.status,
        },
        startedAt: gwStarted,
        endedAt: new Date().toISOString(),
        status: ai.status,
        error: ai.ok ? undefined : ai.content.slice(0, 500),
      };
      const extra = { observations: [reduction, gateway] };
      if (!ai.ok) {
        return {
          ...extra,
          answer: `上游 AI Gateway 失敗 (${ai.status})：${ai.content}`,
          systemPrompt,
          gatewayQuestion: question,
          gatewayRaw: ai.rawText,
          model: settings.model,
          employeeId: settings.employeeId,
        };
      }
      return {
        ...extra,
        answer: ai.content,
        systemPrompt,
        gatewayQuestion: question,
        gatewayRaw: ai.rawText,
        model: settings.model,
        employeeId: settings.employeeId,
      };
    })
    .addNode('saveConversation', (state) => {
      const turns = [
        ...(state.conversation?.turns ?? []),
        { role: 'user' as const, content: state.query },
        { role: 'assistant' as const, content: state.answer },
      ];
      deps.conversations.put({
        id: state.conversationId,
        siteId: state.resolvedSiteId || state.siteId || '',
        summary: summarizeTurns(turns),
        turns,
        updatedAt: new Date().toISOString(),
      });
      return {};
    })
    .addEdge(START, 'loadConversation')
    .addEdge('loadConversation', 'resolveSite')
    .addEdge('resolveSite', 'fetchHealth')
    .addEdge('fetchHealth', 'fetchOverview')
    .addEdge('fetchOverview', 'fetchDescribe')
    .addEdge('fetchDescribe', 'callAiBridge')
    .addEdge('callAiBridge', 'saveConversation')
    .addEdge('saveConversation', END)
    .compile();

  return {
    async run(input: DiagnoseRequest): Promise<DiagnoseResult> {
      const out = await graph.invoke({
        query: input.query,
        siteId: input.siteId ?? '',
        conversationId: input.conversationId ?? '',
        conversation: null,
        sitesJson: '',
        resolvedSiteId: '',
        overviewJson: '',
        healthJson: '',
        describeJson: '',
        answer: '',
        error: '',
        systemPrompt: '',
        gatewayQuestion: '',
        gatewayRaw: '',
        model: '',
        employeeId: '',
        operatorUsername: input.operatorUsername ?? '',
        observations: [],
      });

      const conversationId = out.conversationId || input.conversationId || crypto.randomUUID();
      const siteId = out.resolvedSiteId || input.siteId || '';
      const model = out.model || deps.settings.get().model;
      persistTraceFailOpen(deps.traces, {
        id: crypto.randomUUID(),
        conversationId,
        siteId,
        operatorUsername: input.operatorUsername?.trim() || null,
        query: input.query,
        error: out.error || '',
        answer: out.answer || '',
        model,
        usage: buildTraceUsage({
          rawResponse: out.gatewayRaw || '',
          systemPrompt: out.systemPrompt || '',
          question: out.gatewayQuestion || input.query,
          answer: out.answer || '',
          model,
          rates: input.modelRates ?? {},
        }),
        observations: out.observations ?? [],
        createdAt: new Date().toISOString(),
      });

      return {
        answer: out.answer || '',
        conversationId,
        siteId,
      };
    },
  };
}
