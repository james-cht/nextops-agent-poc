# Technical Stack

NextOps is a single deployable Node.js service built with SvelteKit 2. It serves the operator dashboard and all backend API routes from one process.

## Runtime & language

| Component | Version / choice | Source |
|-----------|------------------|--------|
| Node.js | 20 (Alpine in Docker) | `Dockerfile` |
| TypeScript | ^5.7 | `package.json` |
| Module system | ESM (`"type": "module"`) | `package.json` |

Production listens on `0.0.0.0:3000` (`HOST` / `PORT` env vars in `Dockerfile`).

## Frontend

| Component | Version | Role |
|-----------|---------|------|
| Svelte | ^5.25 | UI components, runes (`$state`, `$derived`, `$effect`) |
| SvelteKit | ^2.20 | Routing, SSR, API routes (`+server.ts`) |
| Vite | ^6.2 | Dev server and bundler |
| Tailwind CSS | ^4.3 | Utility styling via `@tailwindcss/vite` |
| svelte-check | ^4.0 | Type checking (`npm run check`) |

UI copy is primarily Traditional Chinese (zh-TW). Page titles are defined in `src/routes/+layout.svelte`.

## Production adapter

| Component | Role |
|-----------|------|
| `@sveltejs/adapter-node` ^5.5 | Builds a standalone Node server in `build/` |
| Output directory | `build` (configured in `svelte.config.js`) |

`@sveltejs/adapter-auto` is listed as a devDependency but production uses `adapter-node` explicitly.

## Backend dependencies

| Package | Version | Role |
|---------|---------|------|
| `undici` | ^8.5 | HTTP client with optional `EnvHttpProxyAgent` for corporate proxy |
| `mysql2` | ^3.22 | Pipeline metrics queries (`jenkins_build_info`) |

All other backend logic uses SvelteKit built-ins (`fetch`, `hooks.server.ts`, `+server.ts` route handlers).

## External systems

| System | Access pattern | Used by |
|--------|----------------|---------|
| **Prometheus / Thanos** | Per-site `queryUrl` and `alertsUrl` in site config | Global KPIs, site overview, alert polling |
| **Elasticsearch** | Server-side proxy (`ES_BASE_URL`, `LOG_INDEX_PREFIX` + Site Factory Code; [ADR-0013](adr/0013-log-index-factory-code-routing.md)) | Smart Logging SSE, Dify `query_elasticsearch` tool |
| **MySQL** | `mysql2` with optional HTTP CONNECT tunnel | Pipeline metrics KPIs |
| **LangGraph Diagnosis Orchestrator** | Sidecar (`ORCH_BASE_URL`) + AiBridge Gateway | AI Diagnosis chat (`/api/ai/query`) |
| **Alertmanager** | Webhook POST to NextOps | Alert Center ingestion |
| **daily-check-report** | FastAPI sidecar (`DAILY_CHECK_BASE_URL`, port 3300) | 運維點檢 (`/ops-check`). CaaS PromQL uses `PROMETHEUS_URL` |

Site endpoints are defined in `src/lib/site-config.json` (overridable via `NEXTOPS_SITES_CONFIG`).

## Authentication

| Mechanism | Consumer | Implementation |
|-----------|----------|----------------|
| Session cookie (`session=authenticated`) | Browser operators | `src/hooks.server.ts` + `/api/auth/login` |
| Bearer token (`NEXTOPS_DIFY_TOKEN`) | Dify Agent on tool paths | `src/hooks.server.ts` |
| Unauthenticated | Health probe only | `/api/health` |

Tool paths: `/api/sites`, `/api/es`, `/api/ai` (and subpaths).

## Deployment artifacts

| Artifact | Description |
|----------|-------------|
| `Dockerfile` | Multi-stage build: `npm ci` → `npm run build` → production `node build` |
| `daily-check-report/Dockerfile` | Python 3.12 + Playwright Chromium for the check service |
| `docker-compose.yml` | NextOps, MCP adapter, LangGraph orchestrator, daily-check-report |
| Helm chart | Kubernetes deployment; daily check is a sidecar container with its own image |

Health check: `GET /api/health` (Docker `HEALTHCHECK` and K8s probes).

## Development tooling

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server (default `localhost:5173`) |
| `npm run build` | Production build |
| `npm run preview` | Preview production build locally |
| `npm run check` | `svelte-kit sync` + `svelte-check` |
| `npm run test:prometheus` | Node test runner for Prometheus/site-config helpers |
| `npm run test:ops-check` | View-model and `/api/daily-check` proxy tests |
| `npm run test:ui` | Vitest + Testing Library component tests |
| `npm run test:daily-check-report` | pytest for `daily-check-report/` (install that directory's `requirements.txt` first) |

## Environment variable split

SvelteKit convention:

- **Private** (`$env/static/private`) — server-only secrets and upstream URLs (`DB_*`, `DIFY_*`, `ES_BASE_URL`, `NEXTOPS_DIFY_TOKEN`)
- **Public** (`$env/static/public`) — values exposed to the browser for `/admin` config display and client-side Prometheus URL override (`PUBLIC_DEFAULT_*`)

See [Configuration Reference](configuration.md) for the full list.

## Key source directories

```
src/
├── hooks.server.ts          # Auth, global proxy init, handleFetch
├── routes/
│   ├── +page.svelte         # Global Matrix Dashboard
│   ├── logs/                # Smart Logging
│   ├── alerts/              # Alert Center
│   ├── ai/                  # AI Diagnosis
│   ├── admin/               # SRE config + Upstream Diagnosis
│   ├── sites/[siteId]/      # Site Detail
│   ├── login/               # Operator login
│   └── api/                 # REST + SSE endpoints
└── lib/
    ├── site-config.json     # Default site registry
    ├── prometheus.ts        # PromQL fan-out
    ├── alert-manager.ts     # In-memory alert store + SSE broadcast
    ├── log-stream.ts        # Client-side log SSE consumer
    ├── dify-client.ts       # Dify streaming client
    └── server/
        ├── proxy.ts         # undici proxy agent
        ├── mysql.ts         # MySQL + CONNECT tunnel
        └── diagnosis.ts     # Upstream error registry
```
