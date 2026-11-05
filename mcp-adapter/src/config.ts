/** Runtime config for the Tool Endpoint MCP Adapter (ADR-0015). */

export type AdapterConfig = {
  host: string;
  port: number;
  /** Base URL of NextOps (no trailing slash), e.g. http://127.0.0.1:3000 */
  toolBase: string;
  /** Shared Tool Endpoint Token — Dify→Adapter and Adapter→NextOps */
  toolToken: string;
  /** Optional Host allowlist for DNS-rebinding protection when binding 0.0.0.0 */
  allowedHosts: string[] | undefined;
  fetchTimeoutMs: number;
};

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name]?.trim();
  if (!v) {
    throw new Error(`Missing required env ${name}`);
  }
  return v;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AdapterConfig {
  const toolBase = (env.NEXTOPS_TOOL_BASE ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');
  const allowedRaw = env.MCP_ALLOWED_HOSTS?.trim();
  return {
    host: env.MCP_HOST?.trim() || '0.0.0.0',
    port: Number(env.MCP_PORT ?? '3100') || 3100,
    toolBase,
    toolToken: requireEnv(env, 'NEXTOPS_DIFY_TOKEN'),
    allowedHosts: allowedRaw
      ? allowedRaw.split(',').map((h) => h.trim()).filter(Boolean)
      : undefined,
    fetchTimeoutMs: Number(env.MCP_FETCH_TIMEOUT_MS ?? '30000') || 30000,
  };
}
