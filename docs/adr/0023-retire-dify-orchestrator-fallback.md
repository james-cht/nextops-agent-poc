# ADR-0023: Retire Dify as Diagnosis Orchestrator fallback

## Status

Accepted and **implemented** for `/api/ai/query` (supersedes [ADR-0016](0016-langgraph-diagnosis-orchestrator.md) decision 7; [ADR-0014](0014-production-dify-compatibility-floor.md) no longer governs `/api/ai/query`).

## Context

[ADR-0016](0016-langgraph-diagnosis-orchestrator.md) made LangGraph the Diagnosis Orchestrator but kept Dify as an Orchestrator Mode emergency fallback. Diagnosis Trace observations (Tool Endpoint, Context Reduction, AiBridge Gateway) only exist on the LangGraph path. Keeping the switch would leave `/api/ai/query` turns with no Trace, or force a second, thinner Dify trace shape.

## Decision

1. **`/api/ai/query` is LangGraph only.** Dify is not a Diagnosis Orchestrator path. Orchestrator Mode and Dify Chat Credentials are not Runtime Settings.
2. **Tool Endpoint Token remains** (`NEXTOPS_DIFY_TOKEN` is a leftover name, not a Dify product dependency). LangGraph still presents it when calling Tool Endpoints.
3. **Tool Endpoint MCP Adapter is not retired by this ADR** ([ADR-0015](0015-tool-endpoint-mcp-adapter.md) already allows a later retirement).

## Considered Options

| Option | Outcome |
|--------|---------|
| Remove Dify as orchestrator; keep Tool Endpoint Token (chosen) | One graph, complete Traces; token still authenticates tools |
| Keep Dify fallback; skip Traces on that path | Mode switch becomes an observability blind spot |
| Keep Dify fallback with a thin Trace | Two observation shapes; still operating a retired product |
| Also rename the token and retire MCP in the same change | Couples orchestrator cutover to unrelated cleanup |

## Consequences

- Done: `/api/ai/query` has no Dify orchestrator branch; Orchestrator Mode and Dify Chat Credentials are not live Runtime Settings on `/admin/ai-agents` (Tool Endpoint Token + Model Rate Table remain).
- Leftover module/route names (`dify-credentials*`, `NEXTOPS_DIFY_TOKEN`) mean Tool Endpoint Token / legacy probes — not a live Dify Chatflow orchestrator.
- [ADR-0011](0011-runtime-dify-credentials.md) still applies to the Tool Endpoint Token (probe, mask, audit). Chat-key / `DIFY_BASE_URL` as live orchestrator config does not.
- [ADR-0002](0002-dify-orchestration-layer.md) “Dify may remain fallback” is withdrawn.
- [ADR-0014](0014-production-dify-compatibility-floor.md) does not constrain LangGraph or `/api/ai/query`.
