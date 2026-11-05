# Dify Integrator Tutorial

> **Audience:** Engineers configuring the Dify Agent to call NextOps **Tool Endpoints**  
> **Prerequisites:** Running NextOps instance, Dify Chatflow access, [Configuration](configuration.md)

This guide covers bearer authentication, tool paths, environment variables, and example HTTP requests. For Chatflow wiring and network setup, see [Dify Setup](dify-setup.md). For full request/response schemas, see [API Contract](api-contract.md).

Terminology follows [CONTEXT.md](../CONTEXT.md): **Tool Endpoint**, **Dify Agent**, **AI Diagnosis**.

---

## 1. Integration model

```
Operator browser                Dify Agent (optional MCP client)
      │                               │
      │ POST /api/ai/query            │ GET/POST tool paths
      ▼                               ▼
┌─────────────────────────────────────────────────────┐
│              NextOps (SvelteKit)                     │
│  Session cookie (browser)  │  Bearer token (tools)  │
└──────────┬─────────────────┴──────────┬─────────────┘
           │                            │
           ▼                            ▼
    LangGraph + AiBridge            Prometheus / ES
```

- **Browser operators** authenticate via `/login` (session cookie).
- **Dify Agent / MCP Adapter** authenticates via `Authorization: Bearer <NEXTOPS_DIFY_TOKEN>` on tool paths.
- NextOps does **not** call Dify Chat API. AI Diagnosis is LangGraph only ([ADR-0023](adr/0023-retire-dify-orchestrator-fallback.md)).

---

## 2. Environment variables

Set these on the NextOps server (see `.env.example`):

| Variable | Role |
|----------|------|
| `NEXTOPS_DIFY_TOKEN` | Shared secret — Dify/MCP sends this as Bearer token on tool requests |
| `NEXTOPS_SITES_CONFIG` | Optional JSON override for Site registry |
| `LOG_INDEX_PREFIX` | ES log index prefix; queries use `{prefix}-{factoryCode}-*` (default `logs`, ADR-0013) |

**Do not confuse:**

| Token | Direction | Purpose |
|-------|-----------|---------|
| `NEXTOPS_DIFY_TOKEN` | Dify/MCP → NextOps | Authenticate Tool Endpoint calls |

---

## 3. Tool paths and auth

Implemented in `src/hooks.server.ts`:

```typescript
const TOOL_PATHS = ['/api/sites', '/api/es', '/api/ai'];
```

Requests to these prefixes check **Bearer token first**, then fall through to session cookie.

| Path prefix | Used by |
|-------------|---------|
| `/api/sites` | `list_sites`, `get_site_overview`, `get_site_resource_health`, `describe_site` |
| `/api/es` | `query_elasticsearch` |
| `/api/ai` | `POST /api/ai/query` (chat proxy) |

Unauthenticated tool requests return `401` with structured JSON:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid auth",
    "detail": "Bearer token or session required"
  }
}
```

### Dify tool configuration

For each HTTP tool in Dify Chatflow:

| Setting | Value |
|---------|-------|
| Auth type | Bearer |
| Header | `Authorization` |
| Token value | Same as `NEXTOPS_DIFY_TOKEN` on NextOps |

Base URL: your NextOps service URL (e.g. `https://nextops.example.com` or `http://nextops:3000` in-cluster).

---

## 4. Tool endpoints (quick reference)

| Dify tool name | Method | Path | Upstream |
|----------------|--------|------|----------|
| `list_sites` | GET | `/api/sites` | Site config |
| `get_site_overview` | GET | `/api/sites/:siteId/overview` | Per-site Prometheus |
| `get_site_resource_health` | GET | `/api/sites/:siteId/resource-health` | Per-site Prometheus (top-N / deltas) |
| `describe_site` | GET | `/api/sites/:siteId/describe` | Site metadata |
| `query_elasticsearch` | POST | `/api/es/query` | Elasticsearch |

`:siteId` is the **Site id** (URL-encoded), matching `list_sites[].siteId`.

---

## 5. Example requests

Replace `https://nextops.example.com` and `YOUR_DIFY_TOKEN` with your values.

### 5.1 list_sites

```bash
curl -sS \
  -H "Authorization: Bearer YOUR_DIFY_TOKEN" \
  "https://nextops.example.com/api/sites"
```

**Response `200`:**

```json
[
  { "title": "龍華-生產", "clusterTag": "lh-k8s-cluster" },
  { "title": "重慶-生產", "clusterTag": "cq-k8s-cluster" }
]
```

### 5.2 get_site_overview

```bash
curl -sS \
  -H "Authorization: Bearer YOUR_DIFY_TOKEN" \
  "https://nextops.example.com/api/sites/%E9%BE%8D%E8%8F%AF-%E7%94%9F%E7%94%A2/overview"
```

Returns live Prometheus metrics and alert counts. On partial Prometheus failure, individual metrics may be `null` with optional `_warnings` array (still `200`).

### 5.3 get_site_resource_health

```bash
curl -sS \
  -H "Authorization: Bearer YOUR_DIFY_TOKEN" \
  "https://nextops.example.com/api/sites/cq-k8s-cluster/resource-health"
```

Returns Site-scoped saturation by host type, top offenders, restart counts, and 15m/1h deltas. Missing series yield `partial: true` and `available: false` sections.

### 5.4 describe_site

```bash
curl -sS \
  -H "Authorization: Bearer YOUR_DIFY_TOKEN" \
  "https://nextops.example.com/api/sites/%E9%BE%8D%E8%8F%AF-%E7%94%9F%E7%94%A2/describe"
```

Returns `clusterTag`, ES index patterns, and available Prometheus metric names — context for the agent before querying logs or metrics.

### 5.5 query_elasticsearch

```bash
curl -sS -X POST \
  -H "Authorization: Bearer YOUR_DIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "index": "k8s-events-*",
    "query": "level:error",
    "timeFrom": "2026-06-26T00:00:00Z",
    "timeTo": "2026-06-26T23:59:59Z",
    "site": "lh-k8s-cluster",
    "size": 20
  }' \
  "https://nextops.example.com/api/es/query"
```

Request body uses Lucene `query` string plus optional filters (`site` maps to ES `cluster_tag`, `level`, time range). See [API Contract §7.2](api-contract.md#72-request-body-schema).

On ES failure → `502 ES_QUERY_FAILED`; error may also appear in [Upstream Diagnosis](data-flow.md#upstream-diagnosis-admindiagnosis) for operators.

### 5.6 AI query proxy (blocking)

Used by the browser OPSGPT panel; also callable with Bearer token for testing:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer YOUR_DIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What errors occurred in the last hour?",
    "siteId": "lh-k8s-cluster",
    "streaming": false,
    "conversationId": ""
  }' \
  "https://nextops.example.com/api/ai/query"
```

**Response `200`:**

```json
{
  "answer": "...",
  "conversationId": "…",
  "assistantImages": {
    "images": [{ "url": "https://cdn.example.com/chart.png" }],
    "blocked": [],
    "truncated": false
  }
}
```

For streaming (`"streaming": true`), response is `text/event-stream` (SSE). After Dify `message_end`, NextOps emits `event: assistant_images` with allowlisted URLs (see [Dify Setup — Assistant Images](dify-setup.md#assistant-images-opsgpt) and [ADR-0010](adr/0010-assistant-images-opsgpt.md)).

`siteId` is passed to Dify as `inputs.site_id`. Pass `conversationId` from a prior reply to continue the same Dify conversation.

---

## 6. Recommended Chatflow test sequence

1. **`list_sites`** — verify connectivity and obtain `clusterTag` values
2. **`get_site_overview`** — confirm Prometheus reachability for a Site with alerts
3. **`get_site_resource_health`** — confirm top offenders / restart signals for diagnosis
4. **`describe_site`** — inspect ES index patterns before log queries
5. **`query_elasticsearch`** — run a narrow time-range error query (Phase II playbooks)
6. **End-to-end** — ask a natural-language question in Dify Preview; confirm the agent invokes tools and returns synthesized RCA

Detailed Chatflow steps: [Dify Setup § Chatflow setup](dify-setup.md#chatflow-setup).

---

## 7. Network and deployment checklist

| Requirement | Notes |
|-------------|-------|
| Dify → NextOps | Must reach tool path base URL (Ingress or in-cluster Service) |
| NextOps → LangGraph | `ORCH_BASE_URL` reachable from NextOps pod/container |
| NextOps → Prometheus/ES | Per-site URLs in site config; optional HTTP proxy |
| `ORIGIN` env | Set to the public browser URL. Plain HTTP: `http://host:port`. HTTPS / Ingress: `https://…`. If unset, login issues `Secure` cookies that browsers drop on HTTP. |
| SSE buffering | Disable Ingress proxy buffering if streaming AI responses |

See [Deployment Guide](deployment.md) for Docker/Helm specifics.

---

## 8. Error handling for integrators

| HTTP | Code | Action |
|------|------|--------|
| 401 | `UNAUTHORIZED` | Verify `NEXTOPS_DIFY_TOKEN` matches on both sides |
| 404 | `SITE_NOT_FOUND` | Use display title for path param; check site config |
| 502 | `PROMETHEUS_QUERY_FAILED` | Check per-site `queryUrl`; see Upstream Diagnosis |
| 502 | `ES_QUERY_FAILED` | Check ES URL/credentials, Site `factoryCode`, and `LOG_INDEX_PREFIX` |

All errors use the consistent envelope documented in [API Contract §3](api-contract.md#3-consistent-error-format).

---

## Related documents

- [Dify Setup](dify-setup.md) — Chatflow registration and variable mapping
- [API Contract](api-contract.md) — Full schemas and TypeScript types
- [Data flow — AI Diagnosis](data-flow.md#ai-diagnosis-ai) — Operator chat vs. headless tool calls
- [Architecture — API surface](architecture.md#api-surface) — Auth matrix for all endpoints
- [Operator tutorial (zh-TW)](tutorial-operator.md) — Browser UI walkthrough for Cluster Operators
