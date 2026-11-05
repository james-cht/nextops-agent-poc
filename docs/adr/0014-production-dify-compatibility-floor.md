# ADR-0014: Production Dify Compatibility Floor (1.9.1)

## Status

Deprecated by [ADR-0023](0023-retire-dify-orchestrator-fallback.md). Dify is not a Diagnosis Orchestrator path; this floor does not constrain LangGraph or `/api/ai/query` ([ADR-0016](0016-langgraph-diagnosis-orchestrator.md)).

## Context

NextOps AI Diagnosis depends on a self-hosted **Dify Agent** (Chatflow / tools) calling NextOps Tool Endpoints ([ADR-0002](0002-dify-orchestration-layer.md)). Integrators develop Chatflow, Custom Tools (OpenAPI), and DSL against a **development** Dify that may be newer than **production**.

Current versions:

| Environment | Dify version |
|-------------|--------------|
| Production | **1.9.1** |
| Development | **1.13.3** |

Without an explicit floor, DSL / Agent / Studio features that work on 1.13.3 can be treated as production-ready and fail on import or at runtime on 1.9.1 (including silent “intent without tool call” failures when tool binding differs).

## Decision

1. **Production Dify Compatibility Floor = 1.9.1.** Shipped NextOps Dify Integrator artifacts (Chatflow DSL under `docs/dify/`, OpenAPI Custom Tool schemas, integrator docs and the Explore HTML guide) must remain **importable and runnable on Dify 1.9.1**, unless explicitly marked otherwise.
2. **Development may run 1.13.3** (or newer) for exploration. Features that only work above the floor are **Dev-only**: document them with a clear “requires Prod Dify ≥ …” label; do not treat them as the default production delivery path.
3. **Production upgrade** (e.g. 1.9.1 → 1.13.3) is a **separate platform/ops project**, not a Phase I NextOps prerequisite. Until production is upgraded, the floor stays 1.9.1.
4. **Acceptance:** Before calling a Dify arrangement production-ready, the Dify Integrator validates import + Preview (and NextOps `/ai` if credentials point at that app) on **1.9.1**, not only on 1.13.3.
5. **DSL version:** Artifacts under `docs/dify/*.yml` ship with DSL `version: "0.4.0"`, matching Dify 1.9.1 `CURRENT_DSL_VERSION`. Do not commit newer DSL major/minor (e.g. 0.6.0 / 0.7.0) as the production default.

## Considered Options

| Option | Outcome |
|--------|---------|
| Floor = Prod 1.9.1; Dev explores newer (chosen) | Safe default; Dev-only clearly labeled |
| Floor = Dev 1.13.3; force Prod upgrade | Blocks delivery on upgrade risk |
| Maintain two full parallel Chatflow trees forever | High drift cost |

## Consequences

- Repo DSL that targets newer Agent strategies, DSL schema versions, or Studio-only behaviors must either be rewritten for 1.9.1 or marked Dev-only.
- Agent + Tool Endpoint MCP Adapter is the production tool-calling shape ([ADR-0015](0015-tool-endpoint-mcp-adapter.md)); validate on 1.9.1 when MCP is enabled.
- When production Dify is upgraded, revise this ADR (new floor version) and re-validate artifacts on the new floor.
- NextOps application code versioning is independent of this floor; only Dify-side integrator deliverables are constrained.
