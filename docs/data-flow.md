# Data Flow

How telemetry and operator actions move through NextOps. Terminology follows [CONTEXT.md](../CONTEXT.md).

## System context

Regional **Sites** push logs and metrics into central **Elasticsearch** and **Prometheus/Thanos**. NextOps does not collect agents directly — it reads from these central stores and receives Alertmanager webhooks.

```
  Site (cluster)                Central stores              NextOps
 ┌──────────────┐            ┌───────────────┐         ┌─────────────┐
 │ workloads    │──logs─────►│ Elasticsearch │◄────────│ Smart       │
 │ exporters    │──metrics──►│ Prometheus    │◄────────│ Logging,    │
 │ alert rules  │──alerts───►│ Alertmanager  │─webhook►│ Site Detail │
 └──────────────┘            └───────────────┘         └─────────────┘
                                    ▲
                                    │ jenkins_build_info
                              ┌─────┴─────┐
                              │   MySQL   │◄── Pipeline Metrics
                              └───────────┘
```

## Global Matrix Dashboard (`/`)

### Site cards

```
Browser                    NextOps API                 Prometheus (per site)
   │                            │                            │
   │── GET /api/sites ─────────►│                            │
   │◄─ site list ───────────────│                            │
   │                            │                            │
   │── GET /api/sites/:id/overview ────────────────────────►│
   │   (?promql overrides)      │◄─ PromQL results ──────────│
   │◄─ JSON metrics ────────────│                            │
```

- Site ID in URLs uses the **display title** (e.g. `龍華-生產`), not `clusterTag`.
- PromQL templates can be overridden client-side via `promql-config` (stored in `localStorage`).
- If `/api/sites` or per-site overview calls fail, the dashboard shows **error states** on affected cards (red border + error message) — no embedded fallback data. See [Upstream error handling](#upstream-error-handling) below.

### Upstream error handling

When upstream APIs are unreachable, NextOps surfaces explicit errors — never synthetic metrics or alerts.

| Location | Trigger | Behavior |
|----------|---------|----------|
| `+page.svelte` | `/api/sites` list fails | Site grid shows error panel with retry |
| `+page.svelte` | Per-site overview fails | `SiteCard` shows red border + upstream error message |
| `+page.svelte` | Global metrics / pipeline API fails | `KpiCard` shows red border + error message |
| `overview/+server.ts` | Prometheus returns no metric rows | HTTP 502 with `UPSTREAM_ERROR`; registers Upstream Diagnosis entry |
| `alert-manager.ts` | No webhook traffic yet | Empty alert store (Alert Center shows empty state) |
| `pipeline-metrics/+server.ts` | MySQL unreachable | HTTP 500 with `UPSTREAM_ERROR` (no zero placeholders) |

**Production expectation:** operators must see real Prometheus, Elasticsearch, MySQL, and Alertmanager data. Red-bordered cards or empty Alert Center indicate upstream outages — fix connectivity and configuration.

For local setup, point `.env` at reachable upstream URLs. See [local-development.md](local-development.md).

### Global KPIs

| KPI | Endpoint | Data source | PromQL / query |
|-----|----------|-------------|----------------|
| Log health score | `/api/prometheus/global-metrics` | Global Prometheus URL | Custom health PromQL |
| Avg log latency | same | same | Latency PromQL |
| Pipeline success rate | `/api/pipeline-metrics` | MySQL | `jenkins_build_info` aggregation |
| Pipeline timeout rate | same | MySQL | same |

Global Prometheus URL: `PUBLIC_DEFAULT_PROMETHEUS_URL` or operator override from `/admin` (stored in `localStorage` as `nextops-config.prometheus_url`).

## Site Detail (`/sites/[siteId]`)

```
Browser                         NextOps                         Upstream
   │                               │                               │
   │── GET .../overview ──────────►│── PromQL fan-out ────────────►│ Prometheus
   │◄─ K8S + node metrics ─────────│◄──────────────────────────────│
   │                               │                               │
   │── GET .../describe ──────────►│── read site-config ───────────►│ (local JSON)
   │◄─ ES indices, metric list ────│                               │
```

`describe` returns metadata for AI Diagnosis tool context (ES index patterns, available Prometheus metrics). `overview` polls on a configurable interval (default 30s).

## Smart Logging (`/logs`)

Uses **SSE** (not WebSocket). Transport: [ADR-0004](adr/0004-smart-logging-sse-architecture.md). Index routing: [ADR-0013](adr/0013-log-index-factory-code-routing.md).

```
Browser (LogStream)          /api/logs/stream           Elasticsearch
        │                          │                          │
        │── EventSource GET ──────►│                          │
        │   ?siteId&mode&…         │  resolveLogIndex(site)   │
        │                          │── search (poll loop) ───►│
        │◄─ SSE: log batches ──────│◄─ hits ──────────────────│
        │   (every 1–60s)          │                          │
```

Filter / routing parameters (after ADR-0021):

| Param | Behavior |
|-------|----------|
| `siteId` (required) | Single Site; Factory Code prefix |
| `index` (required for SSE) | Exactly one active Watchlist family |
| `documentFilters` | Term filters from Log Field Table / JSON Tree |
| `timeFrom` / `timeTo` | `@timestamp` range |
| `keyword` | `query_string` on log message |
| `interval` | Server poll interval (seconds, clamped 1–60) |

Default index family comes from the operator Watchlist, not a site-wide Mode/Namespace/Pod chrome. `GET /api/logs/facets` is retired.

### Bounded Log Analysis

Operator ticks loaded rows (cap 20) and clicks **送出分析**. Browser `POST /api/ai/query` with a compact log projection (same Orchestrator Chat Contract as OPSGPT). Result paints in the `/logs` Analysis Window, not the OPSGPT bubble list.

Default index: `{LOG_INDEX_PREFIX}-{factoryCode}-*` (prefix default `logs`). Site scope is via index, not `cluster_tag`. Auth: basic auth from `PUBLIC_DEFAULT_ELASTICSEARCH_*` when querying ES.

On ES failure, errors are registered in the **Upstream Diagnosis** registry.

## Alert Center (`/alerts`)

Two ingress paths feed the same in-memory store (`src/lib/alert-manager.ts`):

### Webhook ingestion

```
Alertmanager ── POST /api/alerts/webhook ──► ingestAlerts() ──► Map<fingerprint, Alert>
                                                      │
                                                      └──► broadcast to SSE clients
```

Payload: standard Alertmanager webhook JSON with `alerts[]` array. Alerts deduplicate by `fingerprint`.

### Browser consumption

```
Layout + Alerts page          /api/alerts/stream              alert-manager
        │                            │                              │
        │── EventSource GET ────────►│── register SSE client ──────►│
        │◄─ snapshot + live events ──│◄─ broadcast on ingest ───────│
        │                            │                              │
        │── GET /api/alerts?page ───►│── paginated query ──────────►│
        │── POST /api/alerts/ack ───►│── mark acknowledged ────────►│
```

- Resolved alerts TTL: 24 hours (pruned on interval).
- The in-memory store starts empty; alerts appear only after Alertmanager webhook ingestion. Alert Center shows an empty state until the first webhook arrives.
- Global layout connects alert SSE for sidebar/header unread badges.

See [ADR-0003](adr/0003-webhook-alert-flow.md) and [ADR-0005](adr/0005-alert-feed-sse-architecture.md).

## AI Diagnosis (`/ai`)

Two parallel flows: operator chat UI and Dify Agent tool calls.

### Operator chat (browser)

```
Browser (ChatPanel)        /api/ai/query              Dify Chatflow
        │                       │                          │
        │── POST {query, siteId, conversationId?, streaming}
        │                       │── POST /chat-messages ──►│
        │◄─ SSE text events ────│◄─────────────────────────│
        │◄─ event: assistant_images (allowlisted URLs) ────│
        │                       │                          │
        └──► text first, then Assistant Images / notices
```

`siteId` is passed to Dify as `inputs.site_id`. `conversationId` continues the in-memory Dify conversation until Site context changes or the page reloads. After `message_end`, NextOps emits `assistant_images` (see [ADR-0010](adr/0010-assistant-images-opsgpt.md)).

### Dify Agent tools (headless)

During AI Diagnosis, Dify calls **Tool Endpoints** on NextOps with Bearer auth:

| Tool | Path | Fans out to |
|------|------|-------------|
| `list_sites` | `GET /api/sites` | Site config |
| `get_site_overview` | `GET /api/sites/:id/overview` | Prometheus |
| `get_site_resource_health` | `GET /api/sites/:id/resource-health` | Prometheus |
| `describe_site` | `GET /api/sites/:id/describe` | Site config |
| `query_elasticsearch` | `POST /api/es/query` | Elasticsearch |

See [api-contract.md](api-contract.md), [ADR-0002](adr/0002-dify-orchestration-layer.md), [ADR-0009](adr/0009-site-resource-health-tool.md), and [ADR-0010](adr/0010-assistant-images-opsgpt.md).

## Pipeline Metrics (`/api/pipeline-metrics`)

```
NextOps API              mysql2                    MySQL
     │                      │                        │
     │── query jenkins_build_info ─────────────────►│
     │◄─ successRate, timeoutRate ─────────────────│
```

When `PUBLIC_MYSQL_PROXY_ENABLED=true` (or admin runtime toggle on), MySQL connects via a custom **HTTP CONNECT** tunnel (`src/lib/server/mysql.ts`) using `PUBLIC_DEFAULT_PROXY_HOST` / `PUBLIC_DEFAULT_PROXY_PORT`. Default is **direct TCP** — independent of `PUBLIC_DEFAULT_PROXY_ENABLED`.

## HTTP proxy path

When fetch proxy is enabled (`PUBLIC_DEFAULT_PROXY_ENABLED=true`):

1. `initGlobalProxy()` in `hooks.server.ts` sets undici global dispatcher.
2. `handleFetch` attaches `EnvHttpProxyAgent` to SvelteKit server-side `fetch`.
3. Affects: Prometheus queries, ES queries, Dify API calls.
4. `noProxy`: `localhost,127.0.0.1,::1`

MySQL CONNECT (when `PUBLIC_MYSQL_PROXY_ENABLED` / admin toggle is on) uses the same proxy host/port via a raw TCP CONNECT handshake.

## Upstream Diagnosis (`/admin/diagnosis`)

```
Any API handler on upstream failure
        │
        └──► registerError(service, message) ──► in-memory list
                                                      │
Browser ◄── GET /api/diagnosis ───────────────────────┘
```

Services tracked (examples from `registerError()` calls): `Elasticsearch`, `Prometheus (Global)`, `Prometheus (<site title>)`, `MySQL Database`. Operators can clear all via `POST /api/diagnosis` with `{ "action": "clear" }`.

## Authentication flows

### Operator login

```
Browser ── POST /api/auth/login {user, pass} ──► validate NEXTOPS_ADMIN_* ──► Set-Cookie: session
```

Subsequent requests: `hooks.server.ts` checks `session` cookie.

### Dify tool access

```
Dify ── Authorization: Bearer <NEXTOPS_DIFY_TOKEN> ──► hooks.server.ts ──► handler
```

Falls through to session cookie if bearer does not match (supports browser testing of tools).

## Error propagation

API errors use structured JSON from `src/lib/errors.ts`:

```json
{
  "error": {
    "code": "SITE_NOT_FOUND",
    "message": "...",
    "detail": "..."
  }
}
```

Upstream failures may additionally register in the diagnosis registry for operator visibility.
