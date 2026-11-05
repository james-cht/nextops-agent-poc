/** Runtime config for the LangGraph Diagnosis Orchestrator sidecar (ADR-0016). */

export type OrchestratorConfig = {
  host: string;
  port: number;
  toolBase: string;
  toolToken: string;
  aibridgeBaseUrl: string;
  employeeId: string;
  model: string;
  fetchTimeoutMs: number;
  dataDir: string;
  geAgentProject: string;
  geAgentLocation: string;
  geAgentEngine: string;
  geAgentId: string;
  geAgentAccessToken: string;
};

function optionalEnv(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const v = env[name]?.trim();
  return v || fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OrchestratorConfig {
  const aibridge = optionalEnv(env, 'AIBRIDGE_BASE_URL', 'https://aiot.corp.example.com/gemini-ct').replace(
    /\/+$/,
    '',
  );
  return {
    host: optionalEnv(env, 'ORCH_HOST', '0.0.0.0'),
    port: Number(env.ORCH_PORT ?? '3200') || 3200,
    toolBase: optionalEnv(env, 'NEXTOPS_TOOL_BASE', 'http://127.0.0.1:3000').replace(/\/+$/, ''),
    toolToken: optionalEnv(env, 'NEXTOPS_DIFY_TOKEN', ''),
    aibridgeBaseUrl: aibridge,
    employeeId: optionalEnv(env, 'AIBRIDGE_EMPLOYEE_ID', ''),
    model: optionalEnv(env, 'AIBRIDGE_MODEL', 'gemini-2.5-flash-lite'),
    fetchTimeoutMs: Number(env.ORCH_FETCH_TIMEOUT_MS ?? '180000') || 180000,
    dataDir: optionalEnv(env, 'ORCH_DATA_DIR', '.data'),
    geAgentProject: optionalEnv(env, 'GE_AGENT_PROJECT', 'ebg-proj-ge-aiops-prd'),
    geAgentLocation: optionalEnv(env, 'GE_AGENT_LOCATION', 'global'),
    geAgentEngine: optionalEnv(env, 'GE_AGENT_ENGINE', 'gemini-enterprise-aiops_1789692074759'),
    geAgentId: optionalEnv(env, 'GE_AGENT_ID', '2385562009475238061'),
    geAgentAccessToken: optionalEnv(env, 'GE_AGENT_ACCESS_TOKEN', ''),
  };
}
