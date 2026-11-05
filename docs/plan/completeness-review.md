# Documentation Completeness Review

> **Date:** 2026-06-26  
> **Scope:** Cross-check docs against `src/` before first docs commit  
> **Method:** grep + file reads (routes, `+server.ts`, `hooks.server.ts`, env usage, nav components)

## Checklist

| Area | Checked against | Result |
|------|-----------------|--------|
| UI routes (`src/routes/**/+page.svelte`) | `architecture.md`, `features/index.html`, `tutorial-operator.md` | ✅ 8 routes documented |
| API endpoints (`**/+server.ts`) | `api-contract.md`, `architecture.md`, `tutorial-integrator.md`, `README.md` | ✅ 17 handlers; README table completed |
| Auth (`hooks.server.ts`) | All auth docs | ✅ Public: `/login`, `/api/auth/*`, `/api/health`; tool paths + session |
| Env vars (`.env.example`, `$env` imports) | `configuration.md` | ✅ Fixed ES URL scope note |
| Site config / NA POST | `site-config.json`, `site-config-normalize.ts` | ✅ Documented |
| Proxy | `src/lib/server/proxy.ts`, `mysql.ts` | ✅ Matches `data-flow.md`, `configuration.md` |
| Diagnosis registry | `registerError()` call sites | ✅ Fixed service name examples in tutorials |
| Pipeline metrics | `pipeline-metrics/+server.ts` | ✅ MySQL `jenkins_build_info`, session auth |
| Prometheus global KPIs | `global-metrics/+server.ts` | ✅ GET only; `?prometheusUrl=` documented |
| Health endpoint | `health/+server.ts` | ✅ Unauthenticated `{ status: "ok" }` |
| Sidebar nav | `Sidebar.svelte`, `Header.svelte` | ✅ 3 sidebar + header admin/alerts |
| Direct URL routes | `/ai`, `/admin/diagnosis` | ✅ Documented in architecture, operator tutorial, feature guide |

## UI routes verified

| Route | In docs | Notes |
|-------|---------|-------|
| `/` | ✅ | Sidebar: 全球矩陣大盤 |
| `/logs` | ✅ | Sidebar: 智能日誌流 |
| `/alerts` | ✅ | Sidebar: 告警中心 |
| `/ai` | ✅ | Direct URL |
| `/admin` | ✅ | Header: 管理配置 |
| `/admin/diagnosis` | ✅ | Direct URL; banner entry |
| `/sites/[siteId]` | ✅ | From dashboard cards |
| `/login` | ✅ | Password-only UI; session auth |

## API endpoints verified

| Path | Methods | Auth (hooks) | Documented |
|------|---------|--------------|------------|
| `/api/health` | GET | public | ✅ |
| `/api/auth/login` | POST | public | ✅ (added to README) |
| `/api/auth/logout` | POST | public | ✅ (added to README) |
| `/api/sites` | GET | tool / session | ✅ |
| `/api/sites/:id/overview` | GET | tool / session | ✅ |
| `/api/sites/:id/describe` | GET | tool / session | ✅ |
| `/api/es/query` | POST | tool / session | ✅ |
| `/api/ai/query` | POST | tool / session | ✅ |
| `/api/prometheus/global-metrics` | GET | session | ✅ |
| `/api/pipeline-metrics` | GET | session | ✅ |
| `/api/diagnosis` | GET, POST | session | ✅ |
| `/api/logs/stream` | GET | session | ✅ |
| `/api/alerts/stream` | GET | session | ✅ |
| `/api/alerts` | GET | session | ✅ (added to README) |
| `/api/alerts/ack` | POST | session | ✅ (added to README) |
| `/api/alerts/webhook` | POST | session | ✅ (webhook auth gap noted) |

## Fixes applied (this review)

| File | Fix |
|------|-----|
| `docs/api-contract.md` | `get_site_overview` `status` shape (`osNodes`, `k8sNodes`, `pods`); HTTP 502 on upstream failure (no `_demo` flag); §9 `TOOL_PATHS` includes `/api/ai` |
| `docs/tutorial-integrator.md` | §5.4 ES curl example — correct Lucene body (`index`, `query`, `site` as clusterTag) |
| `docs/tutorial-operator.md` | Diagnosis `service` names match `registerError()` strings |
| `docs/data-flow.md` | Upstream Diagnosis service name examples |
| `docs/architecture.md` | `prometheusUrl` query param name on global-metrics |
| `docs/configuration.md` | `PUBLIC_DEFAULT_ELASTICSEARCH_URL` is admin display only; server uses `ES_BASE_URL` |
| `docs/features/index.html` | Login: password-only UI, accurate layout note |
| `docs/tutorial-operator.md`, `docs/features/index.html`, `docs/explore/index.html` | Decision B: upstream error states (no demo/fallback data); aligns with CONTEXT.md |
| `docs/README.md` | Complete API table (auth, alerts list/ack, webhook auth note) |

## Remaining known gaps (not fixed — out of scope or product)

| Gap | Severity | Notes |
|-----|----------|-------|
| **Login page shows root sidebar** | Low UX | Docs no longer claim “無側邊欄”; product may want `(auth)` route group later |
| **`/admin/diagnosis` page title** | Low | Not in `+layout.svelte` `pageTitles`; page sets its own `<h1>` |
| **`src/lib/validate.ts`** | Doc only | `api-contract.md` still marks shared validation as planned — accurate |
| **Alertmanager webhook auth** | Ops | Webhook requires session cookie today; architecture footnote documents limitation |
| **Design specs drift** | Low | `docs/design/site-detail-architecture.md` still shows old `status.online/total` — pre-existing design doc, not operator-facing |
| **Feature guide screenshots** | Expected | Placeholders only; capture workflow documented |
| **Bilingual feature guide footer** | Pending grill | Step 9 in documentation-plan.md |

## Env var cross-check

All `$env/static/private` and `$env/static/public` imports in `src/` appear in `.env.example` and/or `configuration.md`:

- `NEXTOPS_ADMIN_*`, `NEXTOPS_DIFY_TOKEN`, `DIFY_*`, `ES_BASE_URL`, `LOG_INDEX_PREFIX`
- `DB_*`, `PUBLIC_DEFAULT_*` (Prometheus, ES display, proxy, Dify display)
- `NEXTOPS_SITES_CONFIG` via `$env/dynamic/private` in `site-config.ts`

## Conclusion

Documentation is **aligned with the codebase** for routes, API surface, auth rules, env vars, proxy, diagnosis, pipeline metrics, NA POST Prometheus, and health probe. Review step **resolved** — ready for first docs commit pending grill decisions on screenshots and bilingual footer.
