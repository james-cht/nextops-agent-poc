# ADR-0022: Smart Logging preferences in the Local Settings Store

## Status

Accepted (extends [ADR-0012](0012-local-settings-store.md); does not move Diagnosis Conversations into that store). **Implemented** as `smart_logging_pref` + `/api/logs/prefs`.

## Context

Index Watchlist and Log Categories are operator analysis habits. Multiple Operator Accounts share one NextOps deployment; each needs those habits to survive browser and machine changes. Mode / Namespace / Pod chrome is retired ([ADR-0021](0021-smart-logging-watchlist-document-filters.md)); browser localStorage is not the durable home for Watchlist or Categories. Treating favorites as fleet-wide Runtime Settings would force shared rules and step-up confirmation on every tweak.

## Decision

1. Persist **Index Watchlist**, **Log Categories** (with Category Rules), and **last active Log Index Pattern** per Site in the **Local Settings Store**, keyed by **Operator Account + Site** (`operator_key` + `site_id`).
2. These are **personal preferences**, not Runtime Settings: no step-up gate on save; not Config Audit Log secrets; not shared across accounts.
3. **Do not** persist Document Filters, keyword, or time range as server truth (session/drill-down only), so a narrow overnight filter does not empty tomorrow’s first open.
4. When Operator Account + Site has no categories yet, seed the four editable templates defined for Log Category; seeds are deletable and not undeletable system rows.

## Considered Options

| Option | Outcome |
|--------|---------|
| localStorage only | Lost across browsers/machines; fails multi-account habit retention |
| Fleet-wide Site Watchlist/Categories | One developer’s rules overwrite another’s; governance-heavy |
| Persist full page filter state server-side | Stale Document Filters / short time windows look like “empty stream” bugs |
| Diagnosis Conversation Store | Wrong home; that store is for OPSGPT threads |

## Consequences

- `smart_logging_pref` in the Local Settings Store; `/api/logs/prefs` authenticates via Operator Session.
- CONTEXT: Local Settings Store includes these preferences; avoid localStorage as durable home for Watchlist/Categories.
