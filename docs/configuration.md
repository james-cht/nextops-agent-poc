# Configuration Reference

All configuration is via environment variables. Copy `.env.example` to `.env` for local development.

SvelteKit splits variables into **private** (server-only, no `PUBLIC_` prefix) and **public** (exposed to the browser via `$env/static/public`).

## Required for basic operation

| Variable | Scope | Description | Default |
|----------|-------|-------------|---------|
| `NEXTOPS_ADMIN_USER` | private | Dashboard login username | — |
| `NEXTOPS_ADMIN_PASS` | private | Dashboard login password | — |
| `NEXTOPS_DIFY_TOKEN` | private | Bearer token for Dify tool endpoints **and** Tool Endpoint MCP Adapter auth | — |

## Tool Endpoint MCP Adapter (ADR-0015)

Sidecar process (`mcp-adapter/`) in the same deployment unit. Exposes Streamable HTTP at `/mcp` and proxies Phase I tools to NextOps Tool Endpoints. See [docs/dify/README.md](dify/README.md).

| Variable | Scope | Description | Default |
|----------|-------|-------------|---------|
| `NEXTOPS_TOOL_BASE` | private (adapter) | NextOps base URL used by the Adapter (loopback in-pod) | `http://127.0.0.1:3000` |
| `MCP_HOST` | private (adapter) | Bind address | `0.0.0.0` |
| `MCP_PORT` | private (adapter) | Listen port (Service/Ingress target) | `3100` |
| `MCP_ALLOWED_HOSTS` | private (adapter) | Optional comma-separated Host allowlist | _(empty)_ |
| `MCP_FETCH_TIMEOUT_MS` | private (adapter) | Upstream Tool Endpoint fetch timeout | `30000` |

Dify connects to `http(s)://<reachable-host>:3100/mcp` with `Authorization: Bearer <NEXTOPS_DIFY_TOKEN>` (URL path must end with `/mcp`).

## Diagnosis Orchestrator (LangGraph)

`/api/ai/query` is LangGraph only ([ADR-0023](adr/0023-retire-dify-orchestrator-fallback.md)). Dify Chat Credentials are not Runtime Settings.

| Variable | Scope | Description | Default |
|----------|-------|-------------|---------|
| `ORCH_BASE_URL` | private | LangGraph sidecar base | `http://127.0.0.1:3200` |
| `AIBRIDGE_BASE_URL` | private | AiBridge Gateway base (also seeds Image Allowlist hostname) | corporate `gemini-ct` host |
| `NEXTOPS_IMAGE_ALLOWLIST` | private | Extra hostnames allowed for Assistant Images | _(empty)_ |
| `NEXTOPS_DIFY_TOKEN` | private | Tool Endpoint Token (leftover name) | — |

SRE admin (`/admin/ai-agents`) may override the Tool Endpoint Token and Model Rate Table as Runtime Settings. Diagnosis Traces are at `/admin/traces` (Platform Owner).

## Elasticsearch

| Variable | Scope | Description | Default |
|----------|-------|-------------|---------|
| `ES_BASE_URL` | private | Elasticsearch cluster URL (server proxy for `/api/logs/stream`, `/api/es/query`) | `http://localhost:9200` |
| `LOG_INDEX_PREFIX` | private | Prefix for Site log indices; resolved as `{prefix}-{factoryCode}-*` (see [ADR-0013](adr/0013-log-index-factory-code-routing.md)) | `logs` |
| `LOG_INDEX` | private | **Deprecated** — do not use for Smart Logging routing; replaced by `LOG_INDEX_PREFIX` + Site Factory Code | ~~`filebeat-*`~~ |
| `PUBLIC_DEFAULT_ELASTICSEARCH_URL` | public | Display default on `/admin` only (not used by server ES routes) | — |
| `PUBLIC_DEFAULT_ELASTICSEARCH_USER` | public | Basic auth username | — |
| `PUBLIC_DEFAULT_ELASTICSEARCH_PASSWORD` | public | Basic auth password | — |

## System Behavior Tracking

| Variable | Scope | Description | Default |
|----------|-------|-------------|---------|
| `SYSTEM_BEHAVIOR_TRACKING_ENABLED` | private | Enable backend request telemetry events | `false` |
| `SYSTEM_BEHAVIOR_TRACKING_PERSIST_ES_ENABLED` | private | Persist telemetry to Elasticsearch in addition to stdout | `false` |
| `SYSTEM_BEHAVIOR_TRACKING_ES_INDEX_PREFIX` | private | Prefix for date-partitioned telemetry indices (`*-YYYY.MM.DD`) | `nextops-system-tracking` |
| `SYSTEM_BEHAVIOR_TRACKING_QUEUE_MAX` | private | In-memory persistence retry queue size (drop-oldest policy) | `5000` |
| `SYSTEM_BEHAVIOR_TRACKING_ROUTE_OVERRIDES` | private | JSON include/exclude/bodyCapture allowlist overrides | `{"include":["/api"],"exclude":["/api/auth"],"bodyCaptureAllowlist":[...]}` |
| `NEXTOPS_INSTANCE_ID` | private | Optional stable instance identifier for multi-container tracing | auto-generated UUID on boot |

When persistence is enabled, writes are fail-open: business requests continue even if telemetry ingest fails. Events are always emitted as structured JSON to container stdout.

## Prometheus

| Variable | Scope | Description | Default |
|----------|-------|-------------|---------|
| `PUBLIC_DEFAULT_PROMETHEUS_URL` | public | Global dashboard Prometheus base URL | `http://192.0.2.5:20902` |

Per-site Prometheus endpoints are configured in site config (see below), not via a single global URL.

## Daily check report (運維點檢)

Python service in `daily-check-report/`. NextOps does not query Prometheus for this page itself; it proxies to the service. See [ADR-0039](adr/0039-daily-check-report.md).

| Variable | Scope | Description | Default |
|----------|-------|-------------|---------|
| `DAILY_CHECK_BASE_URL` | private (NextOps) | Base URL of the FastAPI service | `http://127.0.0.1:3300` |
| `DAILY_CHECK_PORT` | private (service) | Listen port | `3300` |
| `DAILY_CHECK_OUT_DIR` | private (service) | Report, history, delivery, and approval files | `./out` |
| `PROMETHEUS_URL` | private (service) | CaaS Prometheus. Compose and Helm set this from `PUBLIC_DEFAULT_PROMETHEUS_URL` | `http://localhost:9090` in the Python package |
| `GMAIL_SA_KEY_FILE`, `GMAIL_DELEGATED_USER`, `GMAIL_OAUTH_TOKEN_FILE`, `GMAIL_FROM`, `GMAIL_TO` | private (service) | Gmail send. Env only; unset means send fails closed | empty |
| `GOOGLE_CHAT_WEBHOOK_URL`, `REPORT_PUBLIC_BASE_URL`, `CHAT_OAUTH_TOKEN_FILE`, `GOOGLE_CHAT_SPACE` | private (service) | Google Chat send. Env only | empty |

SaaS rows are demo data from `daily_check_report/collectors/saas_fake.py` and are tagged `demo_data` in the API. The UI shows 示範資料 on those rows. CaaS values come only from Prometheus; an unreachable query is `UNKNOWN`, not a filled-in number.

## HTTP proxy

When `PUBLIC_DEFAULT_PROXY_ENABLED=true`, outbound `fetch` calls (via undici) for Prometheus / Elasticsearch route through an HTTP CONNECT proxy. **MySQL is independent** — see below.

**Production policy (Direct Upstream Access):** every Production deploy path **applies** both `PUBLIC_DEFAULT_PROXY_ENABLED=false` and `PUBLIC_MYSQL_PROXY_ENABLED=false` unless that environment explicitly opted that switch in. Leftover on-state in env or the Local Settings Store is not a valid Production decision. See [ADR-0019](adr/0019-direct-upstream-access-production-deploy.md). Enable either switch only for developer laptops or segmented networks that cannot reach upstreams directly. Production + fetch-proxy-on still emits a startup warning and does not hard-fail (emergency override allowed, but it must be explicit).

By default, configured Site `queryUrl` / `alertsUrl` hostnames (from `NEXTOPS_SITES_CONFIG` or `site-config.json`) **and** `ES_BASE_URL` / `PUBLIC_DEFAULT_ELASTICSEARCH_URL` hosts are added to `no_proxy` when proxy is enabled, so internal Prometheus and Elasticsearch endpoints are reached directly on production hosts with Direct Upstream Access. MySQL may still use the corporate HTTP CONNECT proxy when that path is required.

**Laptop local dev:** when internal `10.x` hosts are only reachable through the corporate proxy, set `PUBLIC_DEFAULT_PROXY_BYPASS_SITE_HOSTS=false` so site upstreams route via `PUBLIC_DEFAULT_PROXY_HOST` instead of attempting a direct connect that times out.

Example local `.env`:

```env
PUBLIC_DEFAULT_PROXY_ENABLED=true
PUBLIC_DEFAULT_PROXY_HOST=192.0.2.1
PUBLIC_DEFAULT_PROXY_PORT=808
PUBLIC_DEFAULT_PROXY_BYPASS_SITE_HOSTS=false
PUBLIC_MYSQL_PROXY_ENABLED=false
```

On startup with fetch proxy enabled, NextOps logs a `proxy_init` JSON line to stderr listing the effective `noProxy` host list and `bypassSiteHosts` — use this to verify routing after deploy.

If `NODE_ENV=production` and fetch proxy is enabled, startup also emits a **warning** (`severity: "warn"`) recommending `PUBLIC_DEFAULT_PROXY_ENABLED=false` for Direct Upstream Access deployments.

| Variable | Scope | Description | Default |
|----------|-------|-------------|---------|
| `PUBLIC_DEFAULT_PROXY_ENABLED` | public | `"true"` to enable fetch proxy (Prom/ES) | `false` |
| `PUBLIC_DEFAULT_PROXY_HOST` | public | Proxy hostname | — |
| `PUBLIC_DEFAULT_PROXY_PORT` | public | Proxy port | `808` |
| `PUBLIC_DEFAULT_PROXY_BYPASS_SITE_HOSTS` | public | `"true"` adds site upstream hostnames to `no_proxy` (production direct access); `"false"` routes site hosts through the proxy (laptop dev) | `true` |

## MySQL (pipeline metrics)

Used by `/api/pipeline-metrics` and `/api/pipeline-timeouts` to query `jenkins_build_info`. Required for pipeline KPIs on the Global Matrix Dashboard and the timeout drill-down at `/pipelines/timeouts`.

| Variable | Scope | Description | Default |
|----------|-------|-------------|---------|
| `DB_HOST` | private | MySQL hostname | — |
| `DB_PORT` | private | MySQL port | `3306` |
| `DB_USER` | private | MySQL username | — |
| `DB_PASSWORD` | private | MySQL password | — |
| `DB_NAME` | private | Database name | — |
| `PUBLIC_MYSQL_PROXY_ENABLED` | public | `"true"` to tunnel MySQL via `PUBLIC_DEFAULT_PROXY_HOST:PORT` HTTP CONNECT; otherwise direct TCP | `false` |

**Default is direct TCP** to `DB_HOST`. MySQL CONNECT is **not** tied to `PUBLIC_DEFAULT_PROXY_ENABLED`. Cluster Operators can toggle MySQL proxy at `/admin/sources` (`mysql_proxy_enabled`, runtime) — persisted under `.data/mysql-proxy.json`. When enabled, the tunnel uses the same `PUBLIC_DEFAULT_PROXY_HOST` / `PUBLIC_DEFAULT_PROXY_PORT` as fetch.

### Pipeline API query parameters

Both pipeline endpoints accept optional query params (session auth required):

| Param | Values | Default | Description |
|-------|--------|---------|-------------|
| `thresholdSec` | positive integer | `300` | Builds with `build_duration` above this count as timeouts |
| `windowHours` | `24`, `48`, `168` | `24` | Lookback window on `build_time` |
| `appName` | string | — | `/api/pipeline-timeouts` only — filter to one pipeline |

Cluster Operator Build accounts (`mc00146`, `mc00255`, `admin`, `null`) are excluded from all pipeline queries.

The dashboard reads threshold/window from SRE admin settings (browser localStorage) and passes them to these APIs.

## Robusta Store (second MySQL)

Used by `/api/robusta/investigations` and `/api/robusta/snapshot` for Robusta History, and by `/api/logs/live-pod-diagnostics` to read `k8s_pod_diagnostics` by task id. Distinct from Pipeline Metrics `DB_*`. Shares the MySQL CONNECT Runtime Setting. See [ADR-0028](adr/0028-robusta-store-second-mysql.md) and [ADR-0030](adr/0030-live-pod-diagnostics.md).

| Variable | Scope | Description | Default |
|----------|-------|-------------|---------|
| `ROBUSTA_DB_HOST` | private | Robusta Store MySQL hostname | — |
| `ROBUSTA_DB_PORT` | private | MySQL port | `3306` |
| `ROBUSTA_DB_USER` | private | MySQL username | — |
| `ROBUSTA_DB_PASSWORD` | private | MySQL password | — |
| `ROBUSTA_DB_NAME` | private | **MySQL database name** (e.g. `ai-ops`). Not a table name. | — |
| `ROBUSTA_STORE_SCHEMA` | private | Optional JSON mapping. Empty = five `k8s_*_logs` tables filtered by `cluster_id`. Set `mode: investigation_step` only if the Store has investigation + step tables. | _(empty)_ |
| `ROBUSTA_ACTION_URL` | private | Robusta action trigger URL for Live Pod Diagnostics (`POST /api/trigger`). | — |
| `ROBUSTA_ACTION_TOKEN` | private | Robusta Action Token (API auth for the trigger; not a task id). | — |

## SRE operator settings (client-side)

SRE admin (`/admin`, redirects to `/admin/sources`) lets operators tune dashboard behaviour. Client-only values are stored in **browser localStorage** (`nextops-config`). **Runtime Settings** and **Admin Credentials** live in the **Local Settings Store** (SQLite; see [ADR-0012](adr/0012-local-settings-store.md)) — password step-up via shared modal; account changes at `/admin/account`.

| Setting key | Admin route | Effect | Default |
|-------------|-------------|--------|---------|
| `dashboard_refresh_sec` | `/admin/dashboard` | Global Matrix Dashboard auto-refresh interval | `30` |
| `pipeline_timeout_sec` | `/admin/dashboard` | Timeout threshold passed to pipeline APIs | `300` |
| `pipeline_metrics_window_hours` | `/admin/dashboard` | Pipeline lookback window | `24` |
| `NEXTOPS_DIFY_TOKEN` | `/admin/ai-agents` | Runtime Tool Endpoint Token — probe then apply immediately (shared step-up modal) | Deployment env / Local Settings Store |
| Model Rate Table | `/admin/ai-agents` | Runtime — USD rates frozen onto Diagnosis Traces at write time | Local Settings Store seed `gemini-2.5-flash-lite` |
| Diagnosis Traces | `/admin/traces` | Platform Owner only — 30-day Diagnosis Trace Store | LangGraph sidecar sqlite |
| Admin Credential (username/password) | `/admin/account` | Login + step-up; changeable; scrypt in Local Settings Store | Seeded once from `NEXTOPS_ADMIN_*` |
| `mysql_proxy_enabled` | `/admin/sources` | Runtime — MySQL CONNECT toggle | Local Settings Store / env seed |
| Config Audit Log | `/admin/audit` | View Runtime Setting change history | — |
| `elasticsearch_url`, proxy fields, etc. | `/admin/sources` | Display/reference only (`demo` effect) | From `PUBLIC_DEFAULT_*` env |
| PromQL templates | `/admin/promql` | Per-browser query overrides | Baked-in defaults |

Fields marked **部署 env** in the admin UI require `.env` / Helm values changes and a redeploy to take effect server-side.

## Site configuration

Sites define per-region Prometheus query URLs, alertmanager URLs, and cluster tags.

**Default:** `src/lib/site-config.json` (six production sites: 龍華, 重慶, 煙台, 越南, NA, CTTV)

**Override:** Set `NEXTOPS_SITES_CONFIG` to a JSON object:

```json
{
  "龍華-生產": {
    "queryUrl": "http://prometheus:9090",
    "alertsUrl": "http://alertmanager:9093/api/v1/alerts",
    "clusterTag": "lh-k8s-cluster",
    "queryMethod": "GET"
  }
}
```

Fields accept camelCase or snake_case (`query_url`, `cluster_tag`, `query_method`). Sites using Thanos nginx subpaths (e.g. NA) auto-detect `POST` query method when the URL contains `/query-api`.

## Node / SvelteKit runtime

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | `production` in containers | — |
| `HOST` | Bind address | `0.0.0.0` |
| `PORT` | Listen port | `3000` |
| `ORIGIN` | Public URL the browser uses (`http://host:port` or `https://…`). Required for session cookies: if unset, adapter-node assumes https and issues `Secure` cookies that browsers will not store on plain HTTP. | — |

## Security notes

- Never commit `.env` files with real credentials
- Rotate `NEXTOPS_DIFY_TOKEN` independently of AiBridge Gateway settings
- Keep `NEXTOPS_IMAGE_ALLOWLIST` minimal (only hosts that must render as Assistant Images); the hostname from `AIBRIDGE_BASE_URL` is included automatically
- `PUBLIC_*` variables are embedded in client bundles — do not put secrets in `PUBLIC_DEFAULT_*` vars that are actually used server-side for auth; ES credentials in `PUBLIC_DEFAULT_ELASTICSEARCH_*` are an existing pattern used by server routes
