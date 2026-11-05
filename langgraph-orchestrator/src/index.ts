import http from 'node:http';
import path from 'node:path';
import { loadConfig } from './config.js';
import { openConversationStore } from './conversations.js';
import { createDiagnosisGraph } from './graph.js';
import { NextOpsClient } from './nextops-client.js';
import { openOrchestratorSettingsStore } from './settings.js';
import { openTraceStore } from './traces.js';

type DiagnoseBody = {
  query?: string;
  siteId?: string;
  conversationId?: string;
  streaming?: boolean;
  operatorUsername?: string;
  modelRates?: Record<string, { inputUsdPerMillion: number; outputUsdPerMillion: number }>;
};

const config = loadConfig();
const tools = new NextOpsClient({
  toolBase: config.toolBase,
  toolToken: config.toolToken,
  fetchTimeoutMs: config.fetchTimeoutMs,
});
const conversations = openConversationStore(path.join(config.dataDir, 'diagnosis-conversations.sqlite'));
const traces = openTraceStore(path.join(config.dataDir, 'diagnosis-traces.sqlite'));
const settings = openOrchestratorSettingsStore(path.join(config.dataDir, 'diagnosis-settings.sqlite'));
settings.seedOnce({
  employeeId: config.employeeId,
  model: config.model,
});

const graph = createDiagnosisGraph({
  tools,
  conversations,
  settings,
  aibridgeBaseUrl: config.aibridgeBaseUrl,
  fetchTimeoutMs: config.fetchTimeoutMs,
  traces,
  geAgentProject: config.geAgentProject,
  geAgentLocation: config.geAgentLocation,
  geAgentEngine: config.geAgentEngine,
  geAgentId: config.geAgentId,
  geAgentAccessToken: config.geAgentAccessToken,
});

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      json(res, 200, { ok: true });
      return;
    }
    if (req.method === 'GET' && req.url === '/settings') {
      json(res, 200, settings.get());
      return;
    }
    if (req.method === 'PUT' && req.url === '/settings') {
      const body = (await readJson(req)) as { employeeId?: string; model?: string };
      json(res, 200, settings.update(body));
      return;
    }
    if (req.method === 'GET' && req.url) {
      const url = new URL(req.url, 'http://langgraph.local');
      if (url.pathname === '/traces') {
        const limit = Number(url.searchParams.get('limit') || '50');
        json(res, 200, { traces: traces.list({ limit }) });
        return;
      }
      if (url.pathname.startsWith('/traces/')) {
        const id = decodeURIComponent(url.pathname.slice('/traces/'.length));
        const trace = traces.get(id);
        if (!trace) {
          json(res, 404, { error: 'Not found', code: 'NOT_FOUND' });
          return;
        }
        json(res, 200, trace);
        return;
      }
    }
    if (req.method === 'POST' && req.url === '/diagnose') {
      const body = (await readJson(req)) as DiagnoseBody;
      const query = body.query?.trim() ?? '';
      if (!query) {
        json(res, 400, { error: 'query is required', code: 'BAD_REQUEST' });
        return;
      }
      const result = await graph.run({
        query,
        siteId: body.siteId || '',
        conversationId: body.conversationId || '',
        operatorUsername: body.operatorUsername || '',
        modelRates: body.modelRates,
      });
      if (body.streaming) {
        sseOnce(res, result.answer, result.conversationId);
      } else {
        json(res, 200, {
          answer: result.answer,
          conversation_id: result.conversationId,
          site_id: result.siteId,
        });
      }
      return;
    }
    json(res, 404, { error: 'Not found', code: 'NOT_FOUND' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    json(res, 500, { error: message, code: 'INTERNAL_ERROR' });
  }
});

server.listen(config.port, config.host, () => {
  // eslint-disable-next-line no-console
  console.log(`[langgraph-orchestrator] listening on http://${config.host}:${config.port}`);
});

process.on('SIGINT', () => {
  conversations.close();
  traces.close();
  settings.close();
  server.close();
});

process.on('SIGTERM', () => {
  conversations.close();
  traces.close();
  settings.close();
  server.close();
});

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function sseOnce(res: http.ServerResponse, answer: string, conversationId: string): void {
  const encoder = new TextEncoder();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(encoder.encode(`event: message\ndata: ${JSON.stringify({ answer })}\n\n`));
  res.write(
    encoder.encode(`event: message_end\ndata: ${JSON.stringify({ conversation_id: conversationId })}\n\n`),
  );
  res.end();
}
