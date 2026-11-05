import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { NextOpsClient, toolResultText } from './nextops-client.js';

const siteIdSchema = z
  .string()
  .min(1)
  .describe('Catalog siteId from list_sites or Site Binding (e.g. 龍華). Never use clusterTag.');

export function createMcpServer(client: NextOpsClient): McpServer {
  const server = new McpServer({
    name: 'nextops-tool-endpoint-mcp-adapter',
    version: '1.0.0',
  });

  server.registerTool(
    'list_sites',
    {
      description:
        'List all Sites in the NextOps catalog (siteId, title, clusterTag, …). Call when inputs.site_id is empty or the operator names a Site in natural language (e.g. 「龍華」) so you can resolve catalog siteId before metrics tools.',
    },
    async () => {
      const result = await client.listSites();
      return {
        content: [{ type: 'text' as const, text: toolResultText(result) }],
        isError: !result.ok,
      };
    }
  );

  server.registerTool(
    'describe_site',
    {
      description:
        'Site metadata for diagnosis (ES index hints, metric names, factoryCode). Path siteId = catalog siteId (URL-encoded by the adapter).',
      inputSchema: { siteId: siteIdSchema },
    },
    async ({ siteId }) => {
      const result = await client.describeSite(siteId);
      return {
        content: [{ type: 'text' as const, text: toolResultText(result) }],
        isError: !result.ok,
      };
    }
  );

  server.registerTool(
    'get_site_overview',
    {
      description:
        'Live Site overview metrics and alerts. Use catalog siteId, never clusterTag. Call when alerts / overview context is needed.',
      inputSchema: { siteId: siteIdSchema },
    },
    async ({ siteId }) => {
      const result = await client.getSiteOverview(siteId);
      return {
        content: [{ type: 'text' as const, text: toolResultText(result) }],
        isError: !result.ok,
      };
    }
  );

  server.registerTool(
    'get_site_resource_health',
    {
      description:
        'Site resource health — saturation, top offenders (nodes/VMs/pods/containers), restarts, short-window deltas. Prefer this for 資源用量 / 運行狀態 questions.',
      inputSchema: { siteId: siteIdSchema },
    },
    async ({ siteId }) => {
      const result = await client.getSiteResourceHealth(siteId);
      return {
        content: [{ type: 'text' as const, text: toolResultText(result) }],
        isError: !result.ok,
      };
    }
  );

  return server;
}
