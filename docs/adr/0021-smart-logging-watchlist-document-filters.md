# ADR-0021: Smart Logging — Index Watchlist gate and Document Filters

## Status

Accepted (supersedes the Smart Logging **UI / SSE filter chrome** portions of [ADR-0013](0013-log-index-factory-code-routing.md); does **not** reopen Factory Code routing, pattern validation, or ADR-0004 SSE + polling). **Implemented.** Bounded Log Analysis product work is in [ADR-0025](0025-bounded-log-analysis.md).

## Context

Smart Logging previously started from a site-wide `logs-{factoryCode}-*` (or an advanced text pattern), with Mode, Log Namespace / Log Pod comboboxes, level checkboxes, and a facets endpoint. Operators needed a Kibana-like way to pick common index families before streaming, drill from a fixed Log Summary into a Log Field Table and JSON Tree, classify hits with editable rules and ES totals, and highlight without calling an LLM on the hot path.

Keeping dedicated Namespace/Pod/level chrome fought uneven mappings; auto-streaming the site wildcard before favorites were set scanned too broadly.

## Decision

1. **Site still required.** Index targets stay under that Site’s Factory Code prefix ([ADR-0013](0013-log-index-factory-code-routing.md) routing).
2. **Index Watchlist + Site Index Catalog.** Until the operator’s Watchlist for that Site has at least one date-collapsed Log Index Pattern family and an active pattern, SSE does not connect. The catalog enumerates concrete indices under the prefix, collapses date suffixes into families, then applies fuzzy/regex on family names. The stream queries **exactly one** active pattern from the Watchlist (not the union).
3. **Page and SSE align.** Filters are time, keyword, Document Filters (Filter-for-value from Log Field Table / JSON Tree), and optional Log Category drill-down. No Mode toggle, Namespace/Pod combobox, level multi-select, or dedicated `namespace` / `pod` / `level` SSE params. Facets as the Namespace/Pod discovery UI are retired for Smart Logging.
4. **Presentation.** Log Summary (fixed columns + truncated message; structured path projection only, no message grok) → Log Field Table → collapsible JSON Tree. No global Table/Raw/JSON page mode as the primary reader.
5. **Log Category.** Operator Category Rules (Document Filter clauses AND optional message keyword/regex); ES hit counts in the current query scope; overlapping matches allowed; click applies the rule as stream filters. Seed four editable templates (錯誤詞, 5xx, Timeout, 連線失敗). Not unsupervised 分群.
6. **Log Highlight** is client-side and deterministic only. **Bounded Log Analysis** is implemented in [ADR-0025](0025-bounded-log-analysis.md) (Diagnosis Orchestrator + Analysis Window — not in-page AiBridge).
7. **`query_elasticsearch` / `POST /api/es/query`** may keep dedicated `namespace` / `pod` / `level` for a compatibility period; Smart Logging SSE does not. `GET /api/logs/facets` is retired (ADR-0013 Namespace/Pod discovery UI is gone).

## Considered Options

| Option | Outcome |
|--------|---------|
| Cluster-wide index picker without Site | Breaks Factory Code boundary and Tool Endpoint site scope |
| Stream union of whole Watchlist | Mixes schemas; breaks column alignment and category totals |
| Keep Mode / Namespace / Pod / level chrome | Duplicate “error” semantics; empty level filters on raw logs |
| Persist dated concrete index names | Daily rollover empties the stream |
| Per-poll LLM highlighting | Incompatible with near-real-time SSE and AiBridge cost |

## Consequences

- Smart Logging UI/SSE: Watchlist gate, Document Filters, categories, Log Summary → Field Table → JSON Tree (shipped).
- `GET /api/logs/facets` is removed; Factory Code pattern rules remain in [ADR-0013](0013-log-index-factory-code-routing.md).
- CONTEXT terms: Index Watchlist, Site Index Catalog, Document Filter, Log Summary, Log Category, Log Highlight, Bounded Log Analysis.
- Bounded Log Analysis product work is in [ADR-0025](0025-bounded-log-analysis.md).
