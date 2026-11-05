# NextOps Implementation Plan

> **For Hermes:** Use kanban-orchestrator skill to manage this project. Create Kanban cards for each issue below and assign to appropriate profiles (architect, coding-agent, api-designer, code-reviewer, research-agent, writing-agent).

**Goal:** Build an AI-based computing cluster operations dashboard (NextOps) — a centralized SvelteKit platform that ingests logs and metrics from regional clusters into Elasticsearch and Prometheus, and provides AI-assisted diagnosis and natural-language querying via Dify.

**Architecture:** Single SvelteKit service (UI + API), TypeScript, Vite build. Prometheus + Elasticsearch as data stores. Dify Chatflow for AI orchestration. Alertmanager webhook → SvelteKit → SSE for real-time alerts.

**Tech Stack:** SvelteKit 2, Svelte 5, TypeScript, Vite, Dify Chatflow, Prometheus (via Thanos), Elasticsearch, Alertmanager

---

## Current State (2026-06)

**Implemented:**
- Global dashboard with Prometheus KPIs and MySQL pipeline metrics
- Site detail pages (`/sites/[siteId]`)
- Smart logging with ES SSE stream
- Alert center with webhook + SSE
- AI diagnosis page with Dify SSE client
- Auth (session + bearer token for Dify tools)
- HTTP proxy support (undici + MySQL CONNECT tunnel)
- Diagnosis system (`/admin/diagnosis`, `/api/diagnosis`)
- Site config normalization and `NEXTOPS_SITES_CONFIG` override
- Production deployment: Dockerfile, docker-compose, Helm chart
- Health endpoint (`/api/health`)

**Remaining / incremental:**
- Shared validation module (`src/lib/validate.ts`)
- Full structured error contract across all endpoints
- Multi-replica SSE/alert state sharing

See [docs/README.md](../README.md) for current architecture and API overview.

---

## Work Streams

### 1. Site Detail Page (/sites/[siteId])
**Issue:** #1 — Site Detail View
**Priority:** P0 — Core feature
**Description:** Create a detailed single-site dashboard page accessible from the cluster overview. Shows per-site metrics, node breakdown, alert history, and link to Smart Logging.
**Files to create:**
- `src/routes/sites/[siteId]/+page.svelte` — Site detail page
- `src/routes/sites/[siteId]/+layout.svelte` — Site-specific layout
**Files to modify:**
- `src/routes/+page.svelte` — Add links to site detail pages

### 2. Smart Logging Page (/logs)
**Issue:** #2 — Smart Logging Dashboard
**Priority:** P0 — Core feature
**Description:** Near-real-time log streaming from Elasticsearch with filter controls (site, log level, time range, keyword search). Activates when navigating to the logging page.
**Files to create:**
- `src/routes/logs/+page.svelte` — Smart Logging page with ES query UI + SSE streaming
- `src/lib/log-stream.ts` — SSE client for log streaming
- `src/routes/api/logs/stream/+server.ts` — SSE endpoint that streams filtered ES results
**Files to modify:**
- `src/routes/+layout.svelte` — Add "Logs" nav link
- `src/routes/api/es/query/+server.ts` — Enhance with scroll/cursor support for pagination
**Dependencies:** log-stream SSE client is simpler than WebSocket, reconnects natively. Use cursor-based pagination from ES (`search_after`), not `from/size`.

### 3. AI Diagnosis Chat Interface (/ai)
**Issue:** #3 — AI Diagnosis Chat (Dify Integration)
**Priority:** P1 — Differentiating feature
**Description:** Natural-language chat interface where cluster operators ask questions about cluster health. SvelteKit proxies to Dify Chatflow, which invokes tool endpoints to gather ES/Prometheus data.
**Files to create:**
- `src/routes/ai/+page.svelte` — Chat UI (message history, input, streaming response)
- `src/lib/dify-chat.ts` — Dify streaming client (EventSource for streaming responses)
**Files to modify:**
- `src/routes/api/ai/query/+server.ts` — Support `response_mode: 'streaming'` in addition to blocking
**Tool endpoints (registered with Dify):** SvelteKit backend exposes `get_site_overview`, `query_elasticsearch`, `list_sites`, `describe_site` as HTTP tool endpoints Dify calls.

### 4. Real-Time Alert Feed & Dashboard
**Issue:** #4 — Alert Feed Dashboard
**Priority:** P0 — Core feature
**Description:** Ingest Alertmanager webhook alerts, display real-time alert feed on dashboard, show alert counts on site cards, and maintain alert history.
**Files to modify:**
- `src/routes/api/alerts/webhook/+server.ts` — Replace in-memory store with proper alert dedup/time-window logic. Push new alerts to SSE stream.
- `src/routes/+page.svelte` — Show alert badges on site cards with real-time updates
- `src/routes/+layout.svelte` — Add alert bell indicator in nav
**Files to create:**
- `src/routes/api/alerts/stream/+server.ts` — SSE endpoint for real-time alert push
- `src/routes/alerts/+page.svelte` — Full alert history page
- `src/lib/alert-sse.ts` — Reusable SSE client for alerts

### 5. Authentication & Authorization
**Issue:** #5 — Auth Layer
**Priority:** P1 — Required before production
**Description:** Add session-based auth to protect the dashboard. Dify tool endpoints should be secured.
**Files to create:**
- `src/hooks.server.ts` — SvelteKit hooks for auth
- `src/routes/login/+page.svelte` — Login page
- `src/routes/api/auth/login/+server.ts` — Login endpoint
- `src/lib/auth.ts` — Auth utilities (session, password check)
**Recommendation:** Start with simple session + env-based credentials. LDAP/SSO can be ADR'd later.

### 6. Error Handling & Loading States
**Issue:** #6 — Polish: Error States, Loading, Empty States
**Priority:** P2 — Quality of life
**Description:** Add proper error handling, loading spinners, empty state pages, and retry logic across all pages and API endpoints.
**Files to modify:**
- `src/routes/+page.svelte` — Add loading/error/empty states
- `src/routes/sites/[siteId]/+page.svelte` — Same
- `src/routes/logs/+page.svelte` — Same
- `src/routes/api/*` — Structured error responses
**Files to create:**
- `src/lib/components/LoadingSpinner.svelte`
- `src/lib/components/ErrorMessage.svelte`
- `src/lib/components/EmptyState.svelte`

### 7. UI/UX Overhaul (Dark Theme, Responsive Layout)
**Issue:** #7 — UI Theme & Navigation Overhaul
**Priority:** P2 — Polish
**Description:** Replace skeleton styling with the dark-themed, professional operations dashboard UI as specified in the UI design spec. Responsive layout with sidebar navigation.
**Design Reference:** `docs/design/ui-specification.md` — Complete design system with color palette, typography, spacing, and component library. 5 screenshot mockups at `opsdashboard/docs/screenshots/`.
**Files to create:**
- `src/lib/styles/theme.css` — CSS custom properties for dark theme (see design spec for exact hex values)
- `src/lib/components/Sidebar.svelte` — Collapsible sidebar with nav items, red badge for alerts, user profile
- `src/lib/components/Header.svelte` — Top header bar with logo, centered title, right action buttons (config, alerts bell, one-click check)
- `src/lib/components/KpiCard.svelte` — KPI card: large colored number, label, icon, progress bar, trend pill
- `src/lib/components/SiteCard.svelte` — Site monitoring card: status dot, environment tag, CPU/MEM/DISK/NET bars, pod count
- `src/lib/components/AlertCard.svelte` — Alert card: severity-colored background (red/orange/blue), icon, message, timestamp, NEW badge
- `src/lib/components/LogTable.svelte` — Log table: severity-colored badges (ERROR=red, WARN=orange, INFO=blue), trace paths
- `src/lib/components/RcaPanel.svelte` — RCA panel: diagnosis text, numbered recommendations, drill-down bar chart
- `src/lib/components/ChatPanel.svelte` — Chat panel: message bubbles, input field, connection status indicator
- `src/lib/components/BarChart.svelte` — Bar chart with gradient fills (yellow→orange→red), time axis annotations
- `src/lib/components/ConfigCard.svelte` — Config card: colored service badges (ES=red, PR=red, AI=purple), input fields, save button
- `src/lib/components/StatusDot.svelte` — Reusable status dot (green/orange/red), optional pulse animation
- `src/lib/components/ProgressBar.svelte` — Color-coded progress bar (blue < 60%, orange 60-80%, red > 80%)
**Files to modify:**
- `src/routes/+layout.svelte` — Replace nav with sidebar + header layout
- All `+page.svelte` files — Apply theme, use shared components
- `src/app.html` — Add theme class on html element

### 11. Admin Configuration Page (/admin)
**Issue:** #12 — Admin Configuration Page
**Priority:** V2 (post-V1, demo-only)
**Description:** SRE Management Configuration page for backend data source settings. Demo-only: config stored in localStorage.
**Design Reference:** `docs/design/ui-specification.md` (Page 5)
**Files to create:**
- `src/routes/admin/+page.svelte` — Admin config page
- `src/lib/components/ServiceInput.svelte` — Reusable service input with badge, label, input field
**Acceptance Criteria:**
- Config card with 3 sections: ES logging, Prometheus, Dify API
- Colored badges (ES/PR/AI), URL inputs, masked API key input
- Green save button "儲存配置並重新連線" with localStorage persistence
- Footer note: "Demo only · 配置儲存於瀏覽器 localStorage"

---

## Page Inventory (from UI Design Spec)

| # | Page | Route | Status | Issue |
|---|------|-------|--------|-------|
| 1 | Global Matrix Dashboard | `/` | Skeleton exists | — |
| 2 | Smart Logging | `/logs` | Needs building | #2 |
| 3 | Alert Center | `/alerts` | Needs building | #4 |
| 4 | AI Diagnosis | `/ai` | Stub exists | #5, #8 |
| 5 | Admin Config | `/admin` | Needs building | #12 |
| — | Site Detail | `/sites/[siteId]` | Needs building | #1 |

### 8. Dify Tool Endpoint Registration
**Issue:** #8 — Dify Tool Endpoints
**Priority:** P1 — Required for AI Diagnosis
**Description:** Expose the 4 tool endpoints that Dify Chatflow calls during AI diagnosis. These endpoints must be callable by Dify (authenticated, structured response format).
**Existing endpoints (need hardening for Dify consumption):**
- `GET /api/sites` → `list_sites`
- `GET /api/sites/[siteId]/overview` → `get_site_overview`
- `GET /api/sites/[siteId]/describe` → `describe_site`
- `POST /api/es/query` → `query_elasticsearch`
**Requirements:** Consistent response format, error handling, auth token support for Dify.

### 9. Deployment & Operations
**Issue:** #9 — Deployment Setup
**Priority:** P1 — Required for production
**Description:** Docker deployment, environment configuration, health check endpoint.
**Files to create:**
- `Dockerfile` — Multi-stage build, production image
- `docker-compose.yml` — NextOps + Dify connectivity
- `.env.example` — Required env vars documented
- `src/routes/api/health/+server.ts` — Health check endpoint
**Files to modify:**
- `svelte.config.js` — Switch to `adapter-node` for production builds
- `package.json` — Add production start script

### 10. Documentation
**Issue:** #10 — Project Documentation
**Priority:** P2 — Post-V1
**Description:** API docs, deployment guide, Dify configuration guide.
**Files to create:**
- `docs/README.md` — Project overview and getting started
- `docs/adr/` — Additional ADRs as decisions are made
- `docs/deployment.md` — Deployment guide
- `docs/dify-setup.md` — Dify Chatflow configuration guide

---

## Priority Order (Suggested Sprint Plan)

**Sprint 1 — Core Pipeline (P0):**
1. Issue #1 — Site Detail Page
2. Issue #4 — Alert Feed Dashboard
3. Issue #2 — Smart Logging Page

**Sprint 2 — AI & Auth (P1):**
4. Issue #8 — Dify Tool Endpoints
5. Issue #3 — AI Diagnosis Chat
6. Issue #5 — Auth Layer
7. Issue #9 — Deployment Setup

**Sprint 3 — Polish (P2):**
8. Issue #6 — Error Handling
9. Issue #7 — UI Theme Overhaul
10. Issue #10 — Documentation

---

## Existing Domain Terms (from CONTEXT.md)

Use these exact terms in code, UI, and Kanban:
- **Site (Regional Cluster):** A distinct computing cluster deployed in a physical location
- **Tool Endpoint:** HTTP endpoint the SvelteKit backend exposes for Dify
- **AI Diagnosis:** LLM-powered root-cause analysis via Dify
- **Smart Logging:** Dashboard page streaming cluster logs from ES
- **Cluster Operator:** Primary user persona
- **Dify Agent:** The AI orchestration layer powered by Dify Chatflow
- Avoid: "region", "datacenter", "admin", "user", "API" (for tool endpoints), "log viewer"
