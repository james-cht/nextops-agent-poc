# ADR-0024: Diagnosis Trace as NextOps-owned observability

## Status

Accepted (attribution and Platform Owner gating assume [ADR-0027](0027-operator-accounts.md); Bounded Log Analysis turns are in scope per [ADR-0025](0025-bounded-log-analysis.md) once that feature ships). **Implemented** for LangGraph `/api/ai/query` turns (Diagnosis Trace Store, 診斷鏈條 admin UI, Model Rate Table, Viewer gate).

## Context

Platform Owners need to see a Diagnosis Orchestrator turn as a chain: the operator prompt, Tool Endpoints, Context Reduction, AiBridge Gateway payload/response, and Trace Usage (tokens and USD). Shipping Langfuse (self-hosted or cloud) would add a second product and stack, against [ADR-0001](0001-single-sveltekit-service.md) and the requirement that this data stay in the NextOps deployment. System Behavior Tracking is NextOps HTTP health, not LLM-chain observability; the Diagnosis Conversation Store is continuity for the next turn and is deleted when a room is cleared. Operator Accounts ([ADR-0027](0027-operator-accounts.md)) exist, so a Trace can record the initiating Username and a Trace read API can require Platform Owner.

## Decision

1. **NextOps owns Diagnosis Traces.** Do not ship or embed Langfuse. One Orchestrator Chat Contract turn is one Trace (including generate-report, Bounded Log Analysis when shipped, and failed turns).
2. **Three Trace Observation kinds only:** Tool Endpoint call, Context Reduction, AiBridge Gateway call. Store logical Trace Payloads, not raw HTTP; never persist the Tool Endpoint Token.
3. **Diagnosis Trace Store** is separate from the Diagnosis Conversation Store and Local Settings Store. Retention is 30 days (no turn-count cap). Clearing a room does not delete Traces. Persist is fail-open: a Store write failure must not block the Diagnosis Answer.
4. **Only a Platform Owner** may view Traces, in a dedicated SRE admin category (診斷鏈條)—not Upstream Diagnosis, not AI Agents. Hide that nav item from Operator and Viewer; the API still returns 403. Record the initiating Operator Account as its **Username** (not Session id, not Gateway Employee Id). Disabled accounts keep the Username reserved, so old Traces stay attributed ([ADR-0027](0027-operator-accounts.md)).
5. **Trace Usage:** recorded gateway usage when present, otherwise estimated, and labeled. USD uses the Model Rate Table Runtime Setting at write time (step-up applies like other Runtime Settings); changing the table does not rewrite existing Traces. Estimated cost is not a bill.

## Considered Options

| Option | Outcome |
|--------|---------|
| Native Trace model in NextOps (chosen) | Data stays in-deployment; fits Phase I graph; Platform Owner chrome |
| Self-host Langfuse + iframe | Extra Postgres/ClickHouse/Redis; UI/permissions outside Operator Role |
| Langfuse Cloud | Data leaves the deployment |
| Put Traces in the Diagnosis Conversation Store | Operator “clear room” wipes Platform Owner observability |
| Put Traces in System Behavior Tracking / Elasticsearch | Mixes HTTP health with LLM payloads; ES ACL ≠ Platform Owner |
| Fail-closed if Trace persist fails | Trace Store becomes an OPSGPT SPOF |
| Attribute by Session or Gateway Employee Id | Session expires; Employee Id is a shared LLM whitelist, not a person |

## Consequences

- LangGraph Diagnosis Orchestrator writes Traces; NextOps `/api/ai/query` passes the initiating Username into that path.
- Diagnosis Trace Store, Model Rate Table (Runtime Setting), and Platform Owner-only 診斷鏈條 view are in place.
- Truncation of stored Trace Payloads (marked truncated) must not shrink the prompt the AiBridge Gateway actually receives.
- Do not add a Runtime Setting that disables Trace writes.
- **Viewer gate is in place:** `/api/ai/query` and the AI Diagnosis UI use `canStartDiagnosisTurn` so Viewer cannot start turns (including future Bounded Log Analysis).
