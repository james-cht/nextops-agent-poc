# ADR-0004: Smart Logging — Backend SSE with ES Polling

**Status:** Accepted (ES index routing superseded by [ADR-0013](0013-log-index-factory-code-routing.md); Smart Logging UI / SSE filter chrome further shaped by [ADR-0021](0021-smart-logging-watchlist-document-filters.md))  
**Date:** 2026-06-15  
**Context:** Smart Logging page needs near-real-time log streaming from Elasticsearch  
**Referenced by:** Issue #2 — Smart Logging Dashboard, Implementation task

## Decision

Use **backend SSE (Server-Sent Events) with interval-based ES polling** rather than:
- Direct ES polling from the frontend (exposes ES URL/credentials)
- WebSocket (more complex, needs upgrade handshake, no native reconnection)
- ES Percolator (operational complexity, overkill for polling)
- ES `_changes` API (not available in all versions)

## Rationale

1. **Security:** ES credentials stay server-side. Browser only connects to SvelteKit.
2. **Simplicity:** SSE is a standard HTTP response — `EventSource` API handles reconnection natively.
3. **Adequate latency:** 3-second poll interval is sufficient for cluster ops monitoring.
4. **Consistent pattern:** Already used for alert streaming (`/api/alerts/webhook`).
5. **Cursor pagination:** `search_after` avoids deep-pagination penalties of `from/size`.

## Consequences

- Each connected client = one in-flight ES query per poll interval (fine at ops scale)
- SSE connections are long-lived — adapter-node must handle keep-alive
- Poll interval must be configurable per-client
- Server shutdown must cleanly close SSE connections

## Implementation

1. Add `search_after` + cursor response to `POST /api/es/query`
2. Create `GET /api/logs/stream` SSE endpoint with filter query params
3. Create `src/lib/log-stream.ts` — typed SSE client wrapper
4. Create `src/routes/logs/+page.svelte` — Smart Logging UI
5. Add "Logs" nav link to layout

## ES Index

~~Configurable via `LOG_INDEX` env var. Default: `filebeat-*`.~~

**Superseded by [ADR-0013](0013-log-index-factory-code-routing.md):** index targets are resolved from Site Factory Code and `LOG_INDEX_PREFIX` (default `logs`), not a single global `LOG_INDEX`. This ADR still governs SSE + polling + `search_after` only.
