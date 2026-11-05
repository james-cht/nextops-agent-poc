# ADR-0039: Daily check report is its own FastAPI service

## Status

Accepted. Implemented as `daily-check-report/` plus the `/ops-check` page and `/api/daily-check/*` proxies.

## Context

Operators need a daily 雲平台服務點檢報告: Prometheus for CaaS, a clearly marked SaaS demo until a real collector exists, an HTML report, a Playwright PNG, and explicit Gmail / Google Chat delivery. That pipeline is Python (PromQL client, Jinja, Playwright, Google API clients). NextOps itself stays a Node SvelteKit process ([ADR-0001](0001-single-sveltekit-service.md)).

The MCP adapter and LangGraph orchestrator already ship as extra processes in the same deployment unit ([ADR-0015](0015-tool-endpoint-mcp-adapter.md), [ADR-0016](0016-langgraph-diagnosis-orchestrator.md)). They reuse the Node image. This service cannot.

## Decision

1. **Separate image and process.** `daily-check-report/Dockerfile` listens on port 3300 (`GET /health`). Compose, Helm (`dailyCheckReport` sidecar), and Ansible (`nextops_daily_check_*`) start it the same way they start the adapter and orchestrator: enabled by default, scalable to zero, health-checked, port published.
2. **Prometheus URL.** The service reads `PROMETHEUS_URL`. Compose and Helm set that from `PUBLIC_DEFAULT_PROMETHEUS_URL` unless an operator overrides `dailyCheckReport.prometheusUrl`. Gmail and Google Chat credentials are environment variables only.
3. **NextOps is a proxy.** Browser calls under `/api/daily-check/*` require the same session as other UI APIs. POST run, send, and approval append a config-audit entry. 立即點檢 does not send. Send happens only on `/daily-check/send`. A runbook click records `executed: false`.
4. **Stored history is the heatmap.** One report per calendar day under `DAILY_CHECK_OUT_DIR`. Days without a file stay null. SaaS items keep `demo_data: true`. Disabled exporters stay unmonitored and have no invented value.

## Considered Options

| Option | Outcome |
|--------|---------|
| Reimplement collectors in TypeScript inside SvelteKit | Duplicates the existing Python pipeline and Playwright/Gmail code |
| Bake Python into the NextOps Node image | Mixes two runtimes and breaks the image-only Node build |
| Call Gmail from the browser | Puts secrets in the client |

## Consequences

- Image-only deploys must load `daily-check-report` as well as `nextops`, or set `nextops_daily_check_enabled=false`.
- An existing Helm Secret (`existingSecret`) must grow the Gmail / Chat keys listed in `templates/secret.yaml` when those integrations are used. Empty values keep send closed.
- The UI must not synthesize check numbers. Counts, chips, and drawer values are fields on the service JSON.
