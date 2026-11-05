# ADR-0025: Bounded Log Analysis via Diagnosis Orchestrator and Analysis Window

## Status

Accepted and implemented on `/logs` (row selection hard-cap 20, compact projection, Analysis Window via `/api/ai/query`, Suggestion Marker chips, floating window drag/resize restore). Implements the reserved Bounded Log Analysis from [ADR-0021](0021-smart-logging-watchlist-document-filters.md); does not reopen AiBridge-as-orchestrator or a machine-parsed diagnosis schema.

## Context

Operators on Smart Logging need to send a **selected** subset of loaded logs to Gemini-class analysis (text summary, optional images, follow-up questions) without putting LLM calls on the SSE hot path and without a second browser→AiBridge product surface. OPSGPT already owns Diagnosis Answer, Assistant Images, and Diagnosis Conversation Store. Current `/logs` ships Watchlist / Document Filters / categories only ([ADR-0021](0021-smart-logging-watchlist-document-filters.md)).

## Decision

1. **Path:** Bounded Log Analysis is one Orchestrator Chat Contract turn (`/api/ai/query`) with Site Binding = the Smart Logging Site. Smart Logging never calls the AiBridge Gateway directly.
2. **Selection:** Only rows in the loaded stream buffer; hard cap **20**; over cap blocks submit (no silent truncate). Payload is an allowlisted compact projection + per-document message size cap — not full `_source`, not Summary-only.
3. **Result surface:** A single **Analysis Window** (floating) on `/logs`: text, optional Assistant Images (0–3; missing images are OK), Suggestion Marker 「建議提問」 chips. Clicking a chip immediately sends the next turn in the **same** conversation id inside the window.
4. **Conversation:** Persist like generate-report — Diagnosis Conversation Store, hidden from the OPSGPT bubble list by default. A new analysis run confirms then **replaces** the previous Analysis Window / analysis conversation (no multi-window stack).
5. **Authz:** Viewer must not start an analysis turn (same rule as other AI Diagnosis turns; `/api/ai/query` already enforces `canStartDiagnosisTurn`).

## Considered Options

| Option | Outcome |
|--------|---------|
| Direct AiBridge from `/logs` | Second LLM surface; rejected in CONTEXT |
| Jump-only to `/ai` | Leaves the log context; conflicts with floating window |
| Unbounded ES hit dump | Not bounded; token/cost blow-up |
| Require ≥1 Assistant Image | Useful text-only answers would fail |

## Consequences

- `/logs` selection + Analysis Window stream through the same Orchestrator Chat Contract / Assistant Image enrichment as OPSGPT; turns stay off the OPSGPT bubble list (client does not paint them there).
- Pane Maximize on `/ai` is separate — see [ADR-0026](0026-ai-diagnosis-pane-maximize.md).
- Each analysis turn (including in-window follow-ups) is one Diagnosis Trace ([ADR-0024](0024-diagnosis-trace-observability.md)) on the orchestrator path.
