import { splitDiagnosisAnswer } from '../diagnosis-answer-view.ts';

export type ChatOrchestratorTurn = {
  query: string;
  conversationId: string;
  operatorUsername: string;
};

export type ChatOrchestratorResult = {
  answer: string;
  conversationId: string;
  error?: string;
};

export type ChatOrchestrator = {
  runTurn(opts: ChatOrchestratorTurn): Promise<ChatOrchestratorResult>;
};

async function defaultRunTurn(opts: ChatOrchestratorTurn): Promise<ChatOrchestratorResult> {
  const baseUrl = (process.env.ORCH_BASE_URL || 'http://127.0.0.1:3200').replace(/\/+$/, '');
  const res = await fetch(`${baseUrl}/diagnose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: opts.query,
      siteId: '',
      conversationId: opts.conversationId,
      streaming: false,
      operatorUsername: opts.operatorUsername,
      modelRates: {},
    }),
  });
  if (!res.ok) {
    return { answer: '', conversationId: opts.conversationId, error: 'OPSGPT 本回合失敗' };
  }
  const data = (await res.json()) as {
    answer?: string;
    conversation_id?: string;
    conversationId?: string;
  };
  const conversationId = data.conversation_id ?? data.conversationId ?? opts.conversationId;
  return {
    answer: typeof data.answer === 'string' ? data.answer : '',
    conversationId: typeof conversationId === 'string' ? conversationId : '',
  };
}

let orchestrator: ChatOrchestrator = { runTurn: defaultRunTurn };

export function wallDiagnosisAnswer(raw: string): string {
  return splitDiagnosisAnswer(raw).summary;
}

export async function runChatOrchestratorTurn(
  opts: ChatOrchestratorTurn,
): Promise<ChatOrchestratorResult> {
  try {
    return await orchestrator.runTurn(opts);
  } catch {
    return { answer: '', conversationId: opts.conversationId, error: 'OPSGPT 本回合失敗' };
  }
}

/** Test helper */
export function _setChatOrchestratorForTests(next: ChatOrchestrator | null): void {
  orchestrator = next ?? { runTurn: defaultRunTurn };
}
