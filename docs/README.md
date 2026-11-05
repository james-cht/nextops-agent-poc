# NextOps

NextOps is an AI-powered computing cluster operations dashboard for centralized monitoring and diagnosis of global regional clusters. It integrates real-time telemetry from Prometheus and Elasticsearch with a natural-language interface powered by Dify, enabling cluster operators to perform root-cause analysis and health checks.

**Explore hub (zh-TW):** [docs/explore/index.html](explore/index.html) — standalone HTML index of all documentation, UI route map, and embedded feature tour.

**畫面原型館:** [docs/prototypes/](prototypes/README.md) — 可點的假資料畫面（應用上線 / #18，Release `1.2.0`），依版本篩選；與 Explore 分開。

## Core features

| Feature | Route | Data source |
|---------|-------|-------------|
| Global matrix dashboard | `/` | Prometheus (global KPIs), MySQL (pipeline metrics) |
| Site detail views | `/sites/[siteId]` | Per-site Prometheus + Alertmanager |
| Smart logging | `/logs` | Elasticsearch SSE stream |
| AI diagnosis | `/ai` | Dify Chatflow + tool endpoints |
| Alert center | `/alerts` | Alertmanager webhook + SSE |
| 運維點檢 | `/ops-check` | `daily-check-report` (CaaS Prometheus, SaaS demo rows tagged 示範資料) |
| SRE admin | `/admin/*` | Env display + browser localStorage overrides |
| Pipeline timeout drill-down | `/pipelines/timeouts` | MySQL (`jenkins_build_info`) |
| Upstream diagnosis | `/admin/diagnosis` | In-memory upstream error registry |

**Navigation:** The sidebar includes 全球矩陣大盤, 運維助手, 智能日誌流, 告警中心, Robusta 調查歷史, 運維點檢, 應用目錄, and 應用上線. `/admin/diagnosis` and `/pipelines/timeouts` stay [Direct URL routes](../CONTEXT.md). See [Architecture](architecture.md).

**SRE admin** (`/admin`) redirects to `/admin/sources` and includes categories for 資料源, 儀表板, AI Agents, PromQL, 顯示 (Appearance Theme + font size), and 上游診斷.

## Architecture

NextOps is a **single SvelteKit 2 service** (TypeScript, Svelte 5) that serves both the dashboard UI and all API endpoints.

```
Browser / Dify
     │
     ▼
┌─────────────────────────────────────────┐
│  NextOps (SvelteKit + adapter-node)     │
│  ├─ Session auth (cookie)              │
│  ├─ Bearer auth (Dify tool paths)      │
│  └─ HTTP proxy (undici, optional)      │
└──────┬──────────┬──────────┬───────────┘
       │          │          │
       ▼          ▼          ▼
 Prometheus   Elasticsearch  MySQL
 (per-site)   (logs)         (jenkins_build_info)
       │
       ▼
    Dify API (AI orchestration)
```

- **Site configs**: `src/lib/site-config.json` (default) or `NEXTOPS_SITES_CONFIG` env override
- **Proxy**: Optional HTTP CONNECT proxy for reaching internal Prometheus/ES/MySQL through corporate networks
- **SSE**: Real-time alert feed (`/api/alerts/stream`) and log tailing (`/api/logs/stream`)
- **Diagnosis**: Upstream failures (MySQL, Elasticsearch, Prometheus) are registered and surfaced at `/admin/diagnosis`

See [Architecture Decisions (ADRs)](adr/) for rationale behind key choices.

## Getting started

### Local development (Node)

**Prerequisites:** Node.js 22.19+ (required by `undici@8`), npm

```bash
git clone https://github.com/james-cht/nextops.git
cd nextops
npm install
cp .env.example .env   # edit with your values
npm run dev
```

Dashboard: `http://localhost:5173`

### Local development (containers / nerdctl)

For a production-like container run with [nerdctl](https://github.com/containerd/nerdctl) and containerd:

```bash
cp .env.example .env
nerdctl compose up --build
```

See [Local Development Guide](local-development.md) for nerdctl/containerd notes.

### Production deployment

| Method | Guide |
|--------|-------|
| Docker / compose | [Deployment Guide](deployment.md#docker) |
| Kubernetes (Helm) | [Deployment Guide](deployment.md#kubernetes-helm) |

## Documentation index

> **Browse all docs:** [Explore hub (explore/index.html)](explore/index.html) — zh-TW navigation hub (legacy fallback). **New:** [Documentation Explorer](explore-app/README.md) — run `npm run docs:explore:dev` for the interactive SPA (reader, search, graph, Drift). See [ADR-0008](adr/0008-documentation-explore-spa.md) and [FUTURE.md](explore-app/FUTURE.md).

### Getting started

| Document | Description |
|----------|-------------|
| [Exec briefing (zh-TW)](exec-briefing.md) | Internal product narrative for group IT / digital-transformation leadership — not operator tutorial. Web page: [exec-briefing.html](exec-briefing.html) |
| [Tutorial](tutorial.md) | Two tracks — [Operator (zh-TW)](tutorial-operator.md) · [Integrator](tutorial-integrator.md); contributors → [Architecture](architecture.md) + [Local Development](local-development.md) |
| [Explore hub (HTML)](explore/index.html) | Legacy static index (過渡後備) |
| [Documentation Explorer](explore-app/README.md) | Interactive SPA — `npm run docs:explore:dev` · [ADR-0008](adr/0008-documentation-explore-spa.md) · [下一步](explore-app/FUTURE.md) |
| [Feature guide (HTML)](features/index.html) | Visual tour with screenshot placeholders |
| [Local Development](local-development.md) | nerdctl compose, dev workflow |
| [Configuration Reference](configuration.md) | All environment variables |
| [Deployment Guide](deployment.md) | Docker, Helm, operational notes |
| [IDP real-env wiring](idp-real-env-wiring.md) | Application Online → GitLab / KubeSphere / Runtime Check callback |

### Architecture & data

| Document | Description |
|----------|-------------|
| [Technical stack](technical-stack.md) | Runtime, frameworks, dependencies |
| [Architecture overview](architecture.md) | Routes, auth, library layout — **start here for contributors** |
| [Data flow](data-flow.md) | Prometheus, ES, MySQL, alerts, proxy paths |
| [ADRs](adr/) | Architecture decision records |

### Integration & design

| Document | Description |
|----------|-------------|
| [Dify Setup](dify-setup.md) | Chatflow and tool endpoint configuration |
| [API Contract](api-contract.md) | Dify tool endpoint schemas |
| [Design docs](design/) | UI and feature specifications |
| [Documentation plan](plan/documentation-plan.md) | Grill session roadmap |
| [Completeness review](plan/completeness-review.md) | Code-vs-docs cross-check (2026-06-26) |
| [Helm chart](../charts/nextops/README.md) | Kubernetes deployment values |

## Tech stack

- **Runtime**: Node.js 22, SvelteKit 2, Svelte 5, TypeScript, Vite, Tailwind CSS 4
- **Adapter**: `@sveltejs/adapter-node` (production)
- **Data**: Prometheus/Thanos, Elasticsearch, MySQL (`mysql2`)
- **AI**: Dify Chatflow
- **HTTP client**: `undici` (with optional proxy agent)

## Authentication

- **Browser users**: Login at `/login` with `NEXTOPS_ADMIN_USER` / `NEXTOPS_ADMIN_PASS`; session cookie required for UI and most API routes
- **Dify agent**: Bearer token (`NEXTOPS_DIFY_TOKEN`) on tool paths: `/api/sites`, `/api/es`, `/api/ai`
- **Health probe**: `/api/health` is unauthenticated (for K8s/Docker health checks)

## API overview

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Liveness/readiness probe |
| `/api/auth/login` | POST | Operator login (sets session cookie) |
| `/api/auth/logout` | POST | Clear session cookie |
| `/api/sites` | GET | List configured sites |
| `/api/sites/:siteId/overview` | GET | Site metrics and alerts |
| `/api/sites/:siteId/describe` | GET | Site metadata for AI tools |
| `/api/es/query` | POST | Elasticsearch query proxy |
| `/api/ai/query` | POST | Dify Chatflow proxy (SSE) |
| `/api/pipeline-metrics` | GET | Jenkins build success/timeout rates (MySQL; `?thresholdSec=&windowHours=`) |
| `/api/pipeline-timeouts` | GET | Pipeline timeout drill-down (MySQL; `?thresholdSec=&windowHours=&appName=`) |
| `/api/prometheus/global-metrics` | GET | Global log health + latency KPIs (`?prometheusUrl=` optional) |
| `/api/diagnosis` | GET/POST | Upstream error registry |
| `/api/alerts` | GET | Paginated alert history |
| `/api/alerts/ack` | POST | Acknowledge alerts |
| `/api/alerts/stream` | GET | SSE alert feed |
| `/api/logs/stream` | GET | SSE log tail |
| `/api/alerts/webhook` | POST | Alertmanager webhook receiver (session auth) |
