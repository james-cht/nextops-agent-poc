# Tutorial

> **Status:** Active — **two tracks only** (operator + integrator). No developer tutorial in this docs phase.

NextOps tutorials cover **Cluster Operators** and **Dify Integrators**. There is no third “contributor” track — engineers changing the NextOps codebase should start with [Architecture](architecture.md) and [Local Development](local-development.md), then explore `src/`.

Choose the track that matches your role:

| Track | Document | Audience | Language |
|-------|----------|----------|----------|
| **Operator** | [tutorial-operator.md](tutorial-operator.md) | Cluster Operators (SRE / DevOps) monitoring and diagnosing Sites | 繁體中文 (matches UI labels) |
| **Integrator** | [tutorial-integrator.md](tutorial-integrator.md) | Engineers wiring the Dify Agent to NextOps Tool Endpoints | English |

---

## Operator track (summary)

Walkthrough for day-to-day cluster operations:

1. [Login](tutorial-operator.md#1-首次登入) — `/login`, session cookie
2. [Global Matrix Dashboard](tutorial-operator.md#2-全球矩陣大盤global-matrix-dashboard) — KPIs, alert trend, Site cards
3. [Smart Logging](tutorial-operator.md#3-智能日誌流smart-logging) — ES SSE stream, filters
4. [Alert Center](tutorial-operator.md#4-告警中心alert-center) — filtering, acknowledge, severity
5. [AI Diagnosis](tutorial-operator.md#5-ai-診斷ai-diagnosis) — `/ai`, OPSGPT panel, RCA output
6. [Admin configuration](tutorial-operator.md#6-sre-管理配置admin) — env display, localStorage overrides
7. [Upstream Diagnosis](tutorial-operator.md#7-上游診斷upstream-diagnosis) — `/admin/diagnosis` error registry

**Prerequisites:** Node.js 20+ or Docker/Helm deployment; `.env` with `NEXTOPS_ADMIN_*`; reachable Prometheus, Elasticsearch, and (optionally) MySQL.

---

## Integrator track (summary)

Guide for Dify Chatflow configuration:

- Bearer auth on `/api/sites`, `/api/es`, `/api/ai`
- Environment variables (`NEXTOPS_DIFY_TOKEN`, `DIFY_*`)
- Example `curl` requests for all four tools + AI query proxy
- Links to [Dify Setup](dify-setup.md) and [API Contract](api-contract.md)

---

## Contributors (codebase changes)

Not a tutorial track — reference docs for engineers extending NextOps:

| Document | Description |
|----------|-------------|
| [Architecture overview](architecture.md) | Routes, auth, `src/lib/` layout, API surface |
| [Local Development](local-development.md) | nerdctl compose, dev workflow, env setup |
| [Technical stack](technical-stack.md) | Runtime, frameworks, dependencies |
| [Data flow](data-flow.md) | Upstream systems, SSE paths, proxy behavior |
| `src/` | Source of truth for routes, adapters, and UI |

---

## Related guides

| Document | Description |
|----------|-------------|
| [Feature guide (HTML)](features/index.html) | Visual tour with screenshot placeholders |
| [Configuration](configuration.md) | All environment variables |
| [Documentation plan](plan/documentation-plan.md) | Grill session roadmap |
