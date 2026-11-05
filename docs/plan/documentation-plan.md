# NextOps Documentation Plan

> **Status:** Draft — completeness review done (2026-06-26)  
> **Method:** grill-with-docs (interview-driven; code-verified where possible)

## Goals

Produce project documentation covering:

| Area | Status | Location |
|------|--------|----------|
| Glossary / domain language | In progress | `CONTEXT.md` |
| Technical stack | **Written from code** | `docs/technical-stack.md` |
| Architecture overview | **Written from code** | `docs/architecture.md` |
| Data flow | **Written from code** | `docs/data-flow.md` |
| Feature guide (HTML + screenshots) | **zh-TW body** + hybrid capture | `docs/features/` |
| Doc completeness review | **Done** (2026-06-26) | `docs/plan/completeness-review.md` |
| Tutorial | **Written** — two tracks only (operator zh-TW + integrator EN); no developer tutorial this phase | `docs/tutorial.md`, `tutorial-operator.md`, `tutorial-integrator.md` |
| Contributor onboarding | **By reference** — architecture + local dev + codebase (no `tutorial-developer.md`) | `docs/architecture.md`, `docs/local-development.md`, `src/` |
| Ops / deployment | Existing | `docs/deployment.md`, `docs/local-development.md` |
| Configuration | Existing | `docs/configuration.md` |
| Dify integration | Existing | `docs/dify-setup.md`, `docs/api-contract.md` |
| ADRs | Existing | `docs/adr/` |
| Design specs | Existing | `docs/design/`, `docs/designs/` |
| Exec briefing (zh-TW) | **Written** — internal one-pager + [HTML](../exec-briefing.html) | `docs/exec-briefing.md`, `docs/exec-briefing.html` |

## Proposed `docs/` structure

```
docs/
├── README.md                 # Index (updated)
├── plan/
│   └── documentation-plan.md # This file
├── technical-stack.md        # Runtime, frameworks, adapters, deps
├── architecture.md           # Service layout, auth, lib structure
├── data-flow.md              # Prometheus, ES, MySQL, alerts, proxy
├── tutorial.md               # Index — operator + integrator tracks; contributors → architecture + local-dev
├── features/
│   ├── index.html            # Visual feature guide (zh-TW prose + UI labels)
│   ├── styles.css
│   └── screenshots/
│       └── README.md         # Manual capture + optional Playwright
├── configuration.md          # (existing)
├── deployment.md             # (existing)
├── local-development.md      # (existing)
├── dify-setup.md             # (existing)
├── api-contract.md           # (existing)
├── adr/                      # (existing)
├── design/                   # (existing)
└── designs/                  # (existing)

scripts/
└── capture-screenshots.mjs   # npm run docs:screenshots (STAGING_URL)
```

## What is written vs. blocked

### Confidently written from code (no user input)

- **Technical stack** — `package.json`, `svelte.config.js`, `Dockerfile`
- **Architecture** — `src/routes/`, `src/hooks.server.ts`, `src/lib/` layout
- **Data flow** — API endpoints, upstream systems, SSE paths, proxy behavior
- **Feature guide** — one section per route; `<img>` refs with placeholder fallback
- **Screenshot workflow** — manual capture documented; `scripts/capture-screenshots.mjs` scaffolded

### Blocked on grill session

| Topic | Why blocked | Grill question candidate |
|-------|-------------|--------------------------|
| ~~**Tutorial**~~ | ~~Audience unknown~~ | **Resolved:** two tracks only — operator (zh-TW) + integrator (EN) |
| ~~**Developer / contributor tutorial**~~ | ~~Third track?~~ | **Resolved (A):** deferred — not in scope this phase; contributors use `architecture.md`, `local-development.md`, and codebase |
| ~~**Doc language**~~ | ~~UI is zh-TW; existing ops docs are English~~ | **Resolved (B):** operator-facing HTML feature guide body in zh-TW; integrator track stays EN (`tutorial-integrator.md`); reference docs remain EN |
| ~~**Screenshot workflow**~~ | ~~No live environment in CI for capture~~ | **Resolved:** hybrid — manual now; Playwright via `npm run docs:screenshots` when `STAGING_URL` pinned |
| ~~**Demo data policy**~~ | ~~Alert manager and home page seed demo data when upstream unavailable~~ | **Resolved (B):** no embedded demo/fallback data — upstream failures show red-bordered error states; local dev requires real upstreams; operator docs align with CONTEXT.md «Upstream Error State» |
| ~~**AI page nav**~~ | ~~`/ai` and `/admin/diagnosis` not in sidebar~~ | **Resolved (A):** keep off sidebar; document as intentional Direct URL routes in architecture, operator tutorial, feature guide, and CONTEXT.md glossary |

## Cross-references to existing material

| Topic | Existing doc |
|-------|--------------|
| Single-service decision | `docs/adr/0001-single-sveltekit-service.md` |
| Dify orchestration | `docs/adr/0002-dify-orchestration-layer.md` |
| Alert webhook flow | `docs/adr/0003-webhook-alert-flow.md` |
| Smart Logging SSE | `docs/adr/0004-smart-logging-sse-architecture.md` |
| Alert feed SSE | `docs/adr/0005-alert-feed-sse-architecture.md` |
| Site detail design | `docs/design/site-detail-architecture.md` |
| UI specification | `docs/design/ui-specification.md` |

## ADR candidates (not created — pending grill)

No new ADRs proposed in this phase. Existing ADRs already cover the hard-to-reverse decisions (single service, Dify layer, SSE architectures).

## Next grill steps (ordered)

1. ~~Resolve **tutorial audience**~~ → done (two tracks: operator + integrator)
2. ~~Resolve **documentation language**~~ → done (B: feature guide zh-TW body)
3. ~~Resolve **screenshot capture method**~~ → done (hybrid D: manual + optional Playwright)
4. ~~Confirm **demo data** behavior for operator-facing docs~~ → done (B: no fallback data; upstream error states)
5. ~~Decide `/ai` and `/admin/diagnosis` sidebar policy~~ → done (A: direct URL routes, documented)
6. ~~Resolve **developer / contributor tutorial**~~ → done (A: deferred; architecture + local-development + codebase)
7. ~~Resolve **integrator tutorial** scope~~ → done (`tutorial-integrator.md` complete for Dify Integrator onboarding)
8. ~~**Doc completeness review**~~ → **done** — see [completeness-review.md](completeness-review.md)
9. **Bilingual feature guide** — add EN integrator summary section to `features/index.html` footer, or keep integrator docs EN-only in markdown?
