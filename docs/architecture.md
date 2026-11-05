# Architecture Overview

NextOps is a **single SvelteKit 2 service** that serves both the operator dashboard and all API endpoints, including those consumed by the Dify Agent during AI Diagnosis. See [ADR-0001](adr/0001-single-sveltekit-service.md) for the consolidation rationale.

## High-level diagram

```
                    ┌─────────────────────────────────────┐
                    │           Cluster Operator          │
                    │         (browser, session auth)      │
                    └──────────────────┬──────────────────┘
                                       │ HTTPS
                                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                     NextOps (SvelteKit + adapter-node)            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │  UI pages   │  │  hooks.server │  │  API +server.ts routes   │ │
│  │  (Svelte 5) │  │  auth, proxy  │  │  REST + SSE endpoints    │ │
│  └─────────────┘  └──────────────┘  └─────────────────────────┘ │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ alert-mgr   │  │ prometheus   │  │  server/mysql, proxy    │ │
│  │ (in-memory) │  │ fan-out      │  │  diagnosis registry     │ │
│  └─────────────┘  └──────────────┘  └─────────────────────────┘ │
└───────┬──────────────┬──────────────┬──────────────┬─────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
   Alertmanager   Prometheus/     Elasticsearch    MySQL
   (webhook)      Thanos (per-    (logs)           (jenkins_build_info)
                  site)
        ▲
        │
   Dify Agent ──Bearer──► Tool Endpoints (/api/sites, /api/es)
        │
        └──► Dify API ◄── /api/ai/query (chat proxy)
```

## Request lifecycle

1. **Ingress** — All requests pass through `src/hooks.server.ts` except `/login`, `/api/auth/*`, and `/api/health`.
2. **Auth** — Tool paths check Bearer token first (`NEXTOPS_DIFY_TOKEN`), then session cookie. Missing auth → `401` JSON (tools) or `303` redirect to `/login` (UI).
3. **Handler** — SvelteKit resolves to a `+page.svelte` (UI) or `+server.ts` (API).
4. **Outbound** — Server `fetch` and `handleFetch` route through undici with an optional `EnvHttpProxyAgent` when proxy is enabled.

## UI routes

| Route | Page title (zh) | Purpose |
|-------|-----------------|---------|
| `/` | 混合資源 調度指揮中心 | Global Matrix Dashboard |
| `/logs` | 智能日誌流 | Smart Logging |
| `/alerts` | 告警中心 | Alert Center |
| `/ops-check` | 運維點檢 | Daily cloud-platform check. CaaS from Prometheus, SaaS rows tagged 示範資料 |
| `/ai` | 運維助手 | AI Diagnosis (sidebar) |
| `/admin` | SRE 管理配置 | Read-only env display + client config overrides |
| `/admin/diagnosis` | 系統健康診斷與異常註冊表 | Upstream Diagnosis — **direct URL route** (banner entry only) |
| `/sites/[siteId]` | — | Site Detail (linked from dashboard site cards) |
| `/login` | — | Operator authentication |

### Navigation structure

- **Sidebar** (`src/lib/main-sidebar-nav.ts`): 全球矩陣大盤, 運維助手, 智能日誌流, 告警中心, Robusta 調查歷史, 運維點檢, 應用目錄, 應用上線
- **Header** (`src/lib/components/Header.svelte`): Admin config link, alert badge, quick-check button
- **Layout** (`src/routes/+layout.svelte`): Connects global alert SSE for unread badge counts

### Direct URL routes (intentionally hidden from sidebar)

Some operator pages are **registered SvelteKit routes** but deliberately **omitted from the primary sidebar**. Cluster Operators reach them by typing the URL, following contextual links, or using bookmarks — not via the main nav chrome.

| Route | How operators reach it | Rationale |
|-------|------------------------|-----------|
| `/ai` | Direct URL (e.g. bookmark, runbook link) | AI Diagnosis is a deep-dive workflow, not a daily landing view; keeps the sidebar focused on monitoring |
| `/admin/diagnosis` | Global Matrix Dashboard red banner → **查看診斷詳情** | Upstream Diagnosis surfaces only when upstream failures are active; no persistent nav item needed |

This is an intentional product decision (policy **A**): document and teach these paths; do not add sidebar links. See [Operator tutorial](tutorial-operator.md#直接-url-路由) and [Feature guide](features/index.html#nav-model).

## API surface

Grouped by concern. Full schemas for Dify tools are in [api-contract.md](api-contract.md).

### Sites & metrics

| Endpoint | Method | Auth | Upstream |
|----------|--------|------|----------|
| `/api/sites` | GET | session / bearer | `site-config.json` |
| `/api/sites/:siteId/overview` | GET | session / bearer | Per-site Prometheus |
| `/api/sites/:siteId/describe` | GET | session / bearer | Site config metadata |
| `/api/prometheus/global-metrics` | GET | session | Global Prometheus URL (`?prometheusUrl=` or `PUBLIC_DEFAULT_PROMETHEUS_URL`) |
| `/api/pipeline-metrics` | GET | session | MySQL |

### Logs & alerts (real-time)

| Endpoint | Method | Auth | Pattern |
|----------|--------|------|---------|
| `/api/logs/stream` | GET | session | SSE poll of Elasticsearch |
| `/api/alerts/stream` | GET | session | SSE broadcast from in-memory store |
| `/api/alerts` | GET | session | Paginated alert list |
| `/api/alerts/ack` | POST | session | Acknowledge alerts |
| `/api/alerts/webhook` | POST | session* | Alertmanager ingestion |

\*Webhook is behind the same session gate as other routes; Alertmanager must be configured to reach an authenticated endpoint or this path may need a future exemption (not implemented).

### AI & diagnosis

| Endpoint | Method | Auth | Upstream |
|----------|--------|------|----------|
| `/api/ai/query` | POST | session / bearer | Dify Chatflow API |
| `/api/es/query` | POST | session / bearer | Elasticsearch |
| `/api/diagnosis` | GET/POST | session | In-memory error registry |

### Daily check (運維點檢)

Session-authenticated proxies to the `daily-check-report` service (`DAILY_CHECK_BASE_URL`, default `http://127.0.0.1:3300`). See [ADR-0039](adr/0039-daily-check-report.md).

| Endpoint | Method | Behavior |
|----------|--------|----------|
| `/api/daily-check/latest` | GET | Latest report JSON |
| `/api/daily-check/latest.html` | GET | Latest HTML |
| `/api/daily-check/latest.png` | GET | Latest PNG |
| `/api/daily-check/history` | GET | Stored per-day status. Missing days are null |
| `/api/daily-check/reports/:date` | GET | One stored report |
| `/api/daily-check/items/:id` | GET | PromQL, thresholds, per-cluster values |
| `/api/daily-check/delivery` | GET | Delivery log |
| `/api/daily-check/run` | POST | Run a check. Does not send mail unless the body says so |
| `/api/daily-check/send` | POST | Explicit Gmail or Google Chat send |
| `/api/daily-check/approvals` | POST | Record a runbook approval request. Does not execute it |

POST actions append a config audit entry (`daily_check.run`, `daily_check.send`, `daily_check.approval`). System behavior tracking already covers `/api/*`.

### Auth & health

| Endpoint | Method | Auth |
|----------|--------|------|
| `/api/auth/login` | POST | none |
| `/api/auth/logout` | POST | none |
| `/api/health` | GET | none |

## Library layout

| Module | Responsibility |
|--------|----------------|
| `src/lib/site-config.ts` | Load/normalize site registry (JSON file or env override) |
| `src/lib/prometheus.ts` | PromQL queries against per-site Prometheus endpoints |
| `src/lib/promql-config.ts` | Client-side PromQL template overrides (localStorage) |
| `src/lib/alert-manager.ts` | In-memory alert store, dedup by fingerprint, SSE fan-out |
| `src/lib/alert-sse.ts` | Browser SSE client for alert stream |
| `src/lib/log-stream.ts` | Browser SSE client for log tail |
| `src/lib/dify-client.ts` | Parse Dify SSE from `/api/ai/query` |
| `src/lib/server/proxy.ts` | undici `EnvHttpProxyAgent` + global dispatcher |
| `src/lib/server/mysql.ts` | MySQL pool with optional HTTP CONNECT tunnel |
| `src/lib/server/diagnosis.ts` | Register/clear upstream errors for `/admin/diagnosis` |
| `src/lib/errors.ts` | Structured error codes for API responses |

## Site configuration model

Each Site entry maps a display title (e.g. `龍華-生產`) to:

| Field | Purpose |
|-------|---------|
| `clusterTag` | ES filter key, alert labels, Dify `site_id` input |
| `queryUrl` | Prometheus/Thanos query API base |
| `alertsUrl` | Alertmanager alerts API |
| `queryMethod` | Optional `POST` for Thanos-style endpoints (e.g. NA site) |

Default config ships six production Sites in `src/lib/site-config.json`.

## Stateful components

| Component | Storage | Multi-instance note |
|-----------|---------|---------------------|
| Alert store | In-process `Map` | Starts empty; populated by Alertmanager webhooks only |
| SSE clients | In-process `Set` | Sticky sessions or Redis migration needed for horizontal scale |
| Upstream diagnosis | In-process array | Cleared via POST `/api/diagnosis` |
| Operator session | Cookie flag | No server-side session store |

## Security boundaries

- **Browser** sees only `PUBLIC_*` env vars on `/admin`; secrets stay server-side.
- **Dify** (optional MCP client) uses a shared bearer token for tool endpoints (`NEXTOPS_DIFY_TOKEN`).
- **Outbound proxy** tunnels Prometheus, ES, and MySQL through corporate HTTP CONNECT when enabled.

## Related documents

- [Data flow](data-flow.md) — per-feature request paths
- [Technical stack](technical-stack.md) — versions and dependencies
- [Configuration](configuration.md) — environment variables
- [ADRs](adr/) — architectural decisions
