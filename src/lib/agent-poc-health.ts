export type AgentPocHealth = { ok: true; service: "agent-poc"; checkedAt: string };

export function buildAgentPocHealth(now?: Date): AgentPocHealth {
  return {
    ok: true,
    service: "agent-poc",
    checkedAt: (now ?? new Date()).toISOString(),
  };
}
