/**
 * Tool Endpoint MCP Adapter (ADR-0015).
 * Streamable HTTP at POST /mcp — Dify URL should end with `/mcp`.
 */
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { loadConfig } from './config.js';
import { NextOpsClient } from './nextops-client.js';
import { createMcpServer } from './server.js';
import { bearerAuth } from './auth.js';

const config = loadConfig();
const client = new NextOpsClient({
  toolBase: config.toolBase,
  toolToken: config.toolToken,
  fetchTimeoutMs: config.fetchTimeoutMs,
});

const app = createMcpExpressApp({
  host: config.host,
  allowedHosts: config.allowedHosts,
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'nextops-mcp-adapter',
    tools: ['list_sites', 'describe_site', 'get_site_overview', 'get_site_resource_health'],
    toolBase: config.toolBase,
  });
});

app.use('/mcp', bearerAuth(config.toolToken));

app.post('/mcp', async (req, res) => {
  const server = createMcpServer(client);
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
  } catch (error) {
    console.error('MCP request error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

app.get('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. Use POST for Streamable HTTP.' },
    id: null,
  });
});

app.delete('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  });
});

app.listen(config.port, config.host, (error?: Error) => {
  if (error) {
    console.error('Failed to start MCP adapter:', error);
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      event: 'mcp_adapter_listen',
      host: config.host,
      port: config.port,
      toolBase: config.toolBase,
      mcpPath: '/mcp',
    })
  );
});
