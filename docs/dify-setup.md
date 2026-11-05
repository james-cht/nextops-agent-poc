# Dify Setup Guide

> **Superseded for AI Diagnosis.** `/api/ai/query` is LangGraph only ([ADR-0023](adr/0023-retire-dify-orchestrator-fallback.md)). NextOps does not take `DIFY_BASE_URL` / `DIFY_API_KEY` as live config. Keep this page only if you still run a Dify Agent as an optional **Tool Endpoint** client via [ADR-0015](adr/0015-tool-endpoint-mcp-adapter.md) (`NEXTOPS_DIFY_TOKEN`).

Configure the Dify Chatflow for **AI Diagnosis** (運維助手 / OPSGPT) in NextOps.

> **Interactive Studio walkthrough (HTML):** [docs/features/dify-chatflow-setup.html](features/dify-chatflow-setup.html) — node/parameter steps, copyable prompt, checklist. In Documentation Explorer: `#/dify-chatflow` (`npm run docs:explore:dev`).
>
> **Dify versions:** Production **1.9.1** is the [Compatibility Floor](adr/0014-production-dify-compatibility-floor.md) (ADR-0014). Dev may run **1.13.3**; validate on 1.9.1 before go-live.
>
> **Production tool path ([ADR-0015](adr/0015-tool-endpoint-mcp-adapter.md)):** Dify **Agent + Tool Endpoint MCP Adapter** (LLM selects allowlisted tools). Not Custom OpenAPI tools; sequential HTTP Chatflow removed from delivery.
>
> **Importable DSL:** [ops-agent-phase1-agent.yml](dify/ops-agent-phase1-agent.yml) — Start → Agent → Answer; attach MCP tools in Studio. See [docs/dify/README.md](dify/README.md).
>
> **Note:** Edges from LLM → HTTP alone do **not** call APIs. MCP (or an equivalent registered tool provider) is required for LLM-selected tools.

Phase I delivery is **Dify Agent + MCP Adapter** against existing NextOps Tool Endpoints. NextOps already exposes the HTTP tools and proxies `/api/ai/query`; the common failure mode is a Chatflow that is only `開始 → LLM → 直接回覆` with **no tools**, so the model asks the operator to paste CPU/memory numbers.

## AI diagnosis workflow

1. **Browser** → `POST /api/ai/query` — NextOps proxies the user query to Dify Chatflow (SSE streaming). `inputs.site_id` may be empty when the operator has not bound a Site. Optional `conversationId` continues the same Dify conversation within one open chat room.
2. **Dify Agent** → **MCP Adapter** → **Tool Endpoints** — LLM decides when to call allowlisted MCP tools; Adapter GETs NextOps with Bearer auth
3. **NextOps** → **Prometheus / Elasticsearch** — Executes queries and returns structured JSON to the Adapter / Dify
4. **Dify** → synthesizes a natural-language **Diagnosis Answer** (and optional Assistant Images)
5. **NextOps** → passes through Dify SSE text, then emits a final `assistant_images` event with allowlist-validated image URLs (see [ADR-0010](adr/0010-assistant-images-opsgpt.md))

Tool Endpoint JSON stays **inside** the Dify turn. NextOps does **not** re-parse resource-health JSON from `/api/ai/query` — only the final answer text (+ Assistant Images).

Environment / Runtime Settings for an optional Dify MCP client: `NEXTOPS_DIFY_TOKEN`. Image allowlist: `NEXTOPS_IMAGE_ALLOWLIST` plus `AIBRIDGE_BASE_URL` host (see [Configuration Reference](configuration.md)).

| Phase | Tools |
|-------|--------|
| **I (this guide)** | `list_sites`, `get_site_overview`, `get_site_resource_health`, `describe_site` |
| **II (later)** | + constrained log playbooks (not free-form Lucene) |

Full schemas: [API Contract](api-contract.md). Resource health: [ADR-0009](adr/0009-site-resource-health-tool.md). Orchestration: [ADR-0002](adr/0002-dify-orchestration-layer.md). MCP Adapter: [ADR-0015](adr/0015-tool-endpoint-mcp-adapter.md).

---

## Prerequisites

| Check | Detail |
|-------|--------|
| MCP Adapter reachable from Dify | Helm sidecar Service port **3100** → `/mcp` (Streamable HTTP). URL path must end with `/mcp` |
| Tool Endpoint Token | Same value as NextOps `NEXTOPS_DIFY_TOKEN` — used as `Authorization: Bearer …` on the MCP client **and** forwarded by the Adapter to NextOps |
| Adapter → NextOps | Sidecar `NEXTOPS_TOOL_BASE` defaults to `http://127.0.0.1:3000` (same pod) |
| NextOps AI Diagnosis | LangGraph (`ORCH_BASE_URL`); Dify Chat Credentials are not Runtime Settings |
| Do **not** use `localhost` in the MCP URL from Dify | Inside Dify that means the Dify pod itself |

### MCP URL (switchable)

| Mode | Example | When |
|------|---------|------|
| **A (same cluster)** | `http://nextops:3100/mcp` | Dify and NextOps share a cluster |
| **B (Ingress / NodePort)** | `https://nextops.example.com:3100/mcp` | Cross-network; publish MCP Service |

Copyable Dify MCP plugin config: [mcp-servers.example.json](dify/mcp-servers.example.json).

### Token alignment (manual)

Changing `NEXTOPS_DIFY_TOKEN` on NextOps does **not** update Dify. After any rotate:

1. Save the new token on NextOps (Runtime Setting / Secret)
2. Update the MCP client's `Authorization: Bearer …` header to the same value
3. Confirm MCP tool list / Preview-call `list_sites` once

---

## Phase I — concrete Chatflow steps

Target graph:

```text
開始 (Start)  →  Agent (+ MCP Tools)  →  直接回覆 (Answer)
```

Prefer importing [ops-agent-phase1-agent.yml](dify/ops-agent-phase1-agent.yml), then attaching MCP tools.

### Step 1 — Start node: declare `site_id`

1. Open the Chatflow (**Ops Agent** or equivalent) → **編排**
2. Click **開始**
3. Add an input variable:
   - **Variable:** `site_id`
   - **Type:** text / string
   - **Required:** **No** (optional Site Binding)
   - **Label:** optional, e.g. `Site Binding`
4. Save

NextOps always sends `inputs: { site_id: "<id or empty>" }` via `/chat-messages`. If this variable is missing in Dify, the binding is ignored.

### Step 2 — Register Tool Endpoint MCP Adapter

1. Deploy NextOps with `mcpAdapter.enabled: true` (chart default)
2. In Dify (MCP plugin / Agent MCP settings), add server config from [mcp-servers.example.json](dify/mcp-servers.example.json):
   - `transport`: `streamable_http`
   - `url`: reachable `…/mcp`
   - `headers.Authorization`: `Bearer <NEXTOPS_DIFY_TOKEN>`
3. Confirm tools appear: `list_sites`, `describe_site`, `get_site_overview`, `get_site_resource_health`

**Do not** register Dify Custom OpenAPI tools for Prod. OpenAPI file remains a schema reference for the Adapter only.

**Do not** expose `query_elasticsearch` in Phase I.

### Step 3 — Agent node: bind MCP tools + instruction

1. Use an **Agent** node with **Function Calling** (DSL already sets this)
2. Agent → **Tools** → attach the four MCP tools from Step 2
3. Keep vision / files off unless you need Assistant Images later
4. Instruction / system prompt should match the Phase I rules below (already embedded in the DSL)
5. User message includes Site Binding, e.g.:

```text
Site Binding (inputs.site_id): {{#start.site_id#}}

使用者問題：{{#sys.query#}}
```

#### Phase I system prompt (paste and adapt)

```text
你是 NextOps 運維助手（OPSGPT）。你透過 MCP 工具（Tool Endpoints）取得真實叢集資料後，再用繁體中文給出 Diagnosis Answer。

## Site Binding
- 若 inputs.site_id 非空：優先用該值作為 siteId 呼叫 metrics 工具。
- 若為空，或使用者問的是另一個 Site：先呼叫 list_sites，把使用者用語（例如「龍華」）對到回傳的 siteId（不要用 clusterTag 當 path）。
- 傳 catalog 的 siteId 字串即可；Adapter 會 URL-encode。

## 何時必須呼叫工具
- 任何涉及資源用量、運行狀態、負載、告警、節點/容器健康的問題：在回答前必須取得 siteId，並至少呼叫 get_site_resource_health；需要告警/總覽時再呼叫 get_site_overview；需要索引/中繼資料時呼叫 describe_site。
- 禁止要求使用者貼 CPU%、記憶體%、Load 等數字來代替工具結果。
- 純知識／名詞解釋且不涉及某 Site 現況時，可不呼叫工具。

## 回答
- 只根據工具回傳的 JSON 做判斷；工具失敗或 partial 時明確說明缺哪一塊，不要編造用量。
- 輸出自然語言（可用 markdown 表格）。不要假設 NextOps 會解析你的 JSON；最終回覆就是給操作員看的 Diagnosis Answer。
```

### Step 4 — 直接回覆 (Answer) node

Keep **直接回覆** if your Chatflow requires an Answer node:

| Field | Value |
|-------|--------|
| 回覆 | Agent 節點的文字輸出（例如 `{{#agent.text#}}` — 以變數面板為準） |

Do **not** point Answer at a raw tool output. Operators (and NextOps) should see the Agent’s synthesized Diagnosis Answer.

### Step 5 — Publish

1. **預覽 (Preview)** first (Step 6)
2. **Publish** the Chatflow if you still use Dify as an optional MCP client
3. Confirm the MCP client Bearer matches NextOps `NEXTOPS_DIFY_TOKEN`

---

## Verification

### A. Inside Dify Preview

1. Leave `site_id` empty; ask: `請根據資源用量評估「龍華」的當前運行狀態`
2. Expect tool calls: `list_sites` → `get_site_resource_health` (optional `get_site_overview`)
3. Expect an answer that cites real saturation / offenders — **not** “請提供 CPU…”
4. Repeat with `site_id` = `龍華` — should skip fuzzy match or still call health tools directly

### B. From NextOps 運維助手

1. Open `/ai`, same question (unbound and with Site Binding)
2. Stream should show a normal Diagnosis Answer
3. No NextOps code change required for tool JSON parsing

### Failure checklist

| Symptom | Likely cause |
|---------|----------------|
| Model asks you to paste metrics | MCP tools not attached on Agent, or prompt too soft, or Publish not done |
| `401` on MCP / tools | Bearer ≠ `NEXTOPS_DIFY_TOKEN` |
| MCP connect / transport error | URL not ending in `/mcp`; wrong host; firewall |
| `404` / connection error from Adapter | Wrong `NEXTOPS_TOOL_BASE` inside sidecar |
| `SITE_NOT_FOUND` | Used `clusterTag` or wrong siteId |
| NextOps chat works but no tools | NextOps→Dify OK; Dify→MCP→NextOps broken |

---

## Assistant Images (optional)

OPSGPT can show up to **three** remote HTTPS Assistant Images per reply. Operator upload is out of scope.

- Set `NEXTOPS_IMAGE_ALLOWLIST` (comma-separated hostnames); the hostname from `AIBRIDGE_BASE_URL` is also allowlisted
- Return images via native Dify file fields, fenced `media` JSON, or markdown images (see [ADR-0010](adr/0010-assistant-images-opsgpt.md))

---

## Phase II (later) — Elasticsearch logs

When ready:

1. Add **playbook-shaped** MCP tools on the Adapter (ADR-0015) — not raw free-form Lucene
2. Extend the system prompt with Factory Code / index rules from [API Contract §7](api-contract.md#7-endpoint-query_elasticsearch) and [ADR-0013](adr/0013-log-index-factory-code-routing.md)
3. Prefer `describe_site` before inventing index patterns

---

## Kubernetes notes

- Chart: `mcpAdapter.enabled` sidecar shares the NextOps image; Service port `3100` → `/mcp`
- Adapter loopback: `NEXTOPS_TOOL_BASE=http://127.0.0.1:3000`
- Same-cluster Dify: MCP URL `http://<release-name>:3100/mcp`
- SSE buffering (NextOps→browser): see [Deployment Guide](deployment.md) (unrelated to Dify→MCP tool calls)
