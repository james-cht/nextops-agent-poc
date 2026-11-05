# ADR-0002: Dify Chatflow as the AI orchestration layer

## Status

Superseded by [ADR-0016](0016-langgraph-diagnosis-orchestrator.md) as the required orchestration **product**. The Tool Endpoint boundary remains in force.

LLM inference and tool orchestration was handled by Dify Chatflow rather than embedding an LLM directly in the SvelteKit backend. Dify called back into HTTP Tool Endpoints (`get_site_overview`, `get_site_resource_health`, `query_elasticsearch`, `list_sites`, `describe_site`), not directly into ES or Prometheus. Self-hosted inference (vLLM) was rejected as operational complexity because Dify abstracted provider choice.

**Still valid:** query authority stays in SvelteKit Tool Endpoints; the orchestrator must not grow Prom/ES clients.

**Superseded:** Dify as the Diagnosis Orchestrator. Replacement is LangGraph + AiBridge Gateway ([ADR-0016](0016-langgraph-diagnosis-orchestrator.md)). Dify is not an emergency fallback ([ADR-0023](0023-retire-dify-orchestrator-fallback.md)).

**Clarification ([ADR-0015](0015-tool-endpoint-mcp-adapter.md), narrowed by ADR-0016):** MCP is not a replacement orchestrator or a second query path. MCP as a Dify tool-registration adapter is no longer the production path once LangGraph calls Tool Endpoints over HTTP.
