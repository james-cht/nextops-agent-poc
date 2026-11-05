# ADR-0015: Tool Endpoint MCP Adapter for Dify Agent tools

## Status

Accepted historically; **production tool path superseded by [ADR-0016](0016-langgraph-diagnosis-orchestrator.md)** (LangGraph calls Tool Endpoints over HTTP). MCP Adapter may be retired. Clarified [ADR-0002](0002-dify-orchestration-layer.md) while Dify was the orchestrator.

## Context

Production Dify may disallow **Custom (OpenAPI) tools**, so the Dify Agent cannot register NextOps HTTP Tool Endpoints that way. Operator questions vary widely, so a fixed sequential Chatflow (always call the same HTTP nodes) does not scale. We need LLM-selected tools without giving the Agent arbitrary PromQL/Lucene or a second path to Prometheus/Elasticsearch.

ADR-0002 rejected “MCP servers” as an alternative to Dify orchestration and as a duplicate query path. That rejection must not be read as forbidding MCP used only as a **tool registration adapter** in front of existing Tool Endpoints.

## Decision

1. **Introduce a Tool Endpoint MCP Adapter** — an MCP server that exposes a **fixed allowlist** of tools whose implementations **only** call NextOps Tool Endpoints with the **Tool Endpoint Token** (`NEXTOPS_DIFY_TOKEN`). No Prom/ES clients inside the Adapter.
2. **Phase I allowlist:** `list_sites`, `describe_site`, `get_site_overview`, `get_site_resource_health` only. No free-form log query tool in this phase (constrained log playbooks are a later envelope).
3. **Deploy** the Adapter in the **same NextOps deployment unit** (sidecar or equivalent), not a separate data-plane microservice ([ADR-0001](0001-single-sveltekit-service.md) spirit: one product deployment, one query authority).
4. **Auth:** Dify → Adapter and Adapter → NextOps both align on the Tool Endpoint Token (no third long-lived identity).
5. **siteId:** Soft constraint — Agent instruction prefers Site Binding / `list_sites` resolution; NextOps returns `SITE_NOT_FOUND` for unknown ids. No MCP session allowlist state machine in Phase I.
6. **Production delivery path:** Dify **Agent + MCP tools** is the **only** official tool-calling delivery. Sequential HTTP Chatflow DSL and Dify Custom OpenAPI tool registration are **not** production deliverables (Custom Tools may remain as a schema reference for implementing the Adapter).
7. **Compatibility:** Adapter and Agent DSL must remain usable against the [Production Dify Compatibility Floor](0014-production-dify-compatibility-floor.md) (1.9.1) when MCP is enabled there.

## Considered Options

| Option | Outcome |
|--------|---------|
| MCP thin adapter over Tool Endpoints (chosen) | LLM picks tools; query authority stays in SvelteKit |
| MCP/Prom-ES direct tools | Violates ADR-0002; hard to bound |
| Sequential HTTP Chatflow only | No LLM tool choice; poor fit for varied questions |
| Dual-maintain sequential + MCP | Drift cost; rejected for production narrative |
| Hard siteId gate in MCP | Safer, more complex; deferred |

## Consequences

- Implement and chart an MCP sidecar (or equivalent) that mirrors the Phase I Tool Endpoint contract.
- Dify Integrators connect the Agent to that MCP server and attach the four tools; validate on Prod Dify 1.9.1 when MCP is available.
- Remove sequential `ops-agent-phase1.yml` from shipped integrator defaults; document Agent + MCP as the path.
- ADR-0002’s “MCP rejected” clause is **narrowed**: still reject MCP as orchestrator or second query plane; **allow** MCP as Tool Endpoint adapter.
- Phase II log access should add **playbook-shaped** MCP tools, not raw `query_elasticsearch` string freedom, unless a later ADR says otherwise.
