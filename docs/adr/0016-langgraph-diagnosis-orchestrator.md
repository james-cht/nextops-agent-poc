# ADR-0016: LangGraph as the Diagnosis Orchestrator

## Status

Accepted (supersedes Dify as the required orchestration product in [ADR-0002](0002-dify-orchestration-layer.md); narrows [ADR-0015](0015-tool-endpoint-mcp-adapter.md); decision 7 superseded by [ADR-0023](0023-retire-dify-orchestrator-fallback.md))

## Context

AI Diagnosis (OPSGPT) must keep query authority in NextOps Tool Endpoints. Dify Chatflow was that orchestrator ([ADR-0002](0002-dify-orchestration-layer.md)), later with a Tool Endpoint MCP Adapter ([ADR-0015](0015-tool-endpoint-mcp-adapter.md)). Dev Dify Chatflow Agent nodes fail to attach MCP (“代理策略插件版本不支持 MCP 工具”), and we will not keep Dify as the long-term product. The company LLM path is AiBridge Gateway (`POST /api/v1/unified/chat`, `multipart/form-data`), which returns OpenAI-shaped JSON but has no native `tool_calls` or token stream.

## Decision

1. **Diagnosis Orchestrator = TypeScript LangGraph** in the same NextOps deployment unit (sidecar), not a second Prom/ES data plane and not a Python runtime for this phase ([ADR-0001](0001-single-sveltekit-service.md) language-stack preference).
2. **Tools:** LangGraph calls Tool Endpoints over HTTP with the Tool Endpoint Token. MCP Adapter is off the primary path and may be retired.
3. **LLM:** AiBridge Gateway `unified/chat` (`employee_id`, `question`, `model`, optional `system_prompt`). Gateway Employee Id is seed-once in the Local Settings Store (env must not overwrite on boot); base URL and model are Runtime Settings. Default model: `gemini-2.5-flash-lite`. Phase I does not upload files to the gateway.
4. **Diagnosis Graph (Phase I):** resolve Site Binding (`site_id` or `list_sites`), call allowlisted tools (`list_sites`, `describe_site`, `get_site_overview`, `get_site_resource_health`), then one gateway call to write the Diagnosis Answer. The gateway does not execute tools.
5. **Orchestrator Chat Contract:** `/api/ai/query` talks to the sidecar, not Dify `/chat-messages`. Browser still only talks to NextOps. Phase I SSE is NextOps-side after a complete gateway body (no native gateway stream).
6. **Diagnosis Conversation Store:** sidecar SQLite, not the Local Settings Store. Delete on room clear or Site Binding change; else 7 days or 20 turns. Gateway context is a short summary plus current-turn tool JSON.
7. **Orchestrator Mode:** superseded by [ADR-0023](0023-retire-dify-orchestrator-fallback.md). `/api/ai/query` is LangGraph only; Dify is not a fallback.

## Considered Options

| Option | Outcome |
|--------|---------|
| LangGraph TS sidecar + direct Tool Endpoints + AiBridge (chosen) | Leaves Dify; keeps Tool Endpoint boundary; fits gateway SOP |
| Keep Dify Agent + MCP | Blocked by Chatflow strategy plugin; version/plugin coupling |
| Embed agent in SvelteKit process | Tighter coupling; harder to scale/replace the graph |
| Python LangGraph sidecar | Extra runtime vs ADR-0001 |
| Native gateway tool_calls / OpenAI SDK drop-in | SOP does not provide tools or `/v1/chat/completions` |
| Persist chats in Local Settings Store | Mixes operator transcripts with Admin/Runtime secrets |
| Dual-run Dify and LangGraph in one room | Conversation-id and credential drift |

## Consequences

- `/api/ai/query` talks to the LangGraph sidecar only ([ADR-0023](0023-retire-dify-orchestrator-fallback.md)); Dify is not a fallback.
- [ADR-0014](0014-production-dify-compatibility-floor.md) does not constrain LangGraph or `/api/ai/query`.
- [ADR-0015](0015-tool-endpoint-mcp-adapter.md) is no longer the production tool-registration path.
- Do not commit Gateway Employee Id; seed from env into Local Settings Store once.
