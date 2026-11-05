# NextOps Ops Agent — Dify + MCP

Dify imports **YAML DSL** (`.yml`), not XML.

**Production path ([ADR-0015](../adr/0015-tool-endpoint-mcp-adapter.md)):** Dify **Agent** selects tools via a **Tool Endpoint MCP Adapter** (sidecar). Custom OpenAPI tools and sequential HTTP Chatflows are **not** production deliverables.

## Compatibility (ADR-0014)

| Env | Dify | DSL `version` |
|-----|------|----------------|
| **Production (floor)** | **1.9.1** | **`0.4.0`** |
| Development | 1.13.3 | Do not commit newer DSL as Prod default |

Validate Agent + MCP on **1.9.1** when MCP is enabled in that environment.

## Why MCP (not Custom Tools / sequential HTTP)

| Approach | Status |
|----------|--------|
| **Agent + MCP Adapter** | **Production** — LLM picks among allowlisted tools; varied operator questions |
| Dify Custom (OpenAPI) tools | Not available / not used in Prod policy |
| Sequential HTTP Chatflow | Removed from delivery — no LLM tool choice |

**Capability envelope (Phase I):** only

- `list_sites`
- `describe_site`
- `get_site_overview`
- `get_site_resource_health`

No free-form PromQL or Lucene. Adapter calls NextOps Tool Endpoints only (Bearer **Tool Endpoint Token**).

## Files

| File | Role |
|------|------|
| [`ops-agent-phase1-agent.yml`](./ops-agent-phase1-agent.yml) | Chatflow: Start → Agent → Answer (attach MCP tools in Studio after import) |
| [`mcp-servers.example.json`](./mcp-servers.example.json) | Dify MCP plugin / servers_config example (`streamable_http` → `/mcp`) |
| [`nextops-tool-endpoints.openapi.yaml`](./nextops-tool-endpoints.openapi.yaml) | **Schema reference** for Adapter tool shapes (not for Dify Custom Tool import in Prod) |

## Setup — Agent + MCP

### A. Deploy Adapter (NextOps chart)

Helm defaults enable the sidecar (`mcpAdapter.enabled: true`):

| Env (sidecar) | Default | Meaning |
|---------------|---------|---------|
| `NEXTOPS_TOOL_BASE` | `http://127.0.0.1:3000` | Loopback to NextOps in the same pod |
| `NEXTOPS_DIFY_TOKEN` | from Secret | Same Tool Endpoint Token (Dify→MCP and MCP→NextOps) |
| `MCP_PORT` | `3100` | Streamable HTTP listen port |

Service exposes port **3100** (`mcp`). Dify MCP URL must end with **`/mcp`** (Streamable HTTP).

Example (same cluster as Dify):

```text
http://nextops:3100/mcp
```

Example (Ingress / NodePort — replace host):

```text
https://nextops.example.com:3100/mcp
```

Auth header on the MCP client:

```text
Authorization: Bearer <NEXTOPS_DIFY_TOKEN>
```

### B. Dify Studio

1. Add MCP server using [`mcp-servers.example.json`](./mcp-servers.example.json) (or paste into MCP plugin `servers_config`). Confirm tools listed match the Phase I four.
2. **匯入 DSL** → `ops-agent-phase1-agent.yml` (DSL `0.4.0`).
3. Ensure **Agent strategy** (Function Calling) is available; re-select model credentials.
4. Agent node → **Tools** → attach the four MCP tools (YAML keeps `tools: []` — workspace-bound).
5. Preview: `請根據資源用量評估「龍華」的當前運行狀態` — expect **real tool calls**, not intent-only text.
6. **Publish** the Agent if you still use Dify as an optional MCP client. NextOps AI Diagnosis does not read `DIFY_API_KEY`.

### siteId (soft constraint)

Prefer `inputs.site_id` when set; else `list_sites` then match operator wording to catalog `siteId` (Adapter URL-encodes). Unknown ids → NextOps `SITE_NOT_FOUND`.

### Token rotate

Changing `NEXTOPS_DIFY_TOKEN` on NextOps requires updating the MCP client's `Authorization` header to the same value (one place — not four Custom Tools).

## Local adapter (dev)

```bash
cd mcp-adapter
npm ci
NEXTOPS_DIFY_TOKEN=changeme-dify-token NEXTOPS_TOOL_BASE=http://127.0.0.1:3000 npm run dev
# health: GET http://127.0.0.1:3100/health
# mcp:    POST http://127.0.0.1:3100/mcp  (Bearer required)
```

## Related

- [ADR-0015 Tool Endpoint MCP Adapter](../adr/0015-tool-endpoint-mcp-adapter.md)
- [ADR-0002](../adr/0002-dify-orchestration-layer.md) (clarified)
- [ADR-0014](../adr/0014-production-dify-compatibility-floor.md)
- [dify-setup.md](../dify-setup.md)
- [api-contract.md](../api-contract.md)
