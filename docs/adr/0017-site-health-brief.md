# ADR-0017: Site Health Brief replaces the strategic RCA card

## Status

Accepted

## Context

The `/ai` mock (`docs/design/ui-specification.md`) put a “戰略性根因分析 (RCA)” card on the left, filled from a machine-parsed ` ```rca ` fence. That schema was never an ADR. [ADR-0016](0016-langgraph-diagnosis-orchestrator.md) made the Diagnosis Answer the only LLM product; Phase I does not require a parsed diagnosis schema. The card therefore stayed a placeholder after Site Binding.

Operators still need a compact, one-screen health surface next to OPSGPT: fleet navigation when unbound, deeper collapsible brief when bound, optional LLM report without auto-diagnosis on bind.

## Decision

Replace the RCA card with a **Site Health Brief** on `/ai`:

- Unbound: overview-level saturation plus firing-alert counts (not Site Resource Health for every Site — [ADR-0009](0009-site-resource-health-tool.md)).
- Bound: Site Resource Health plus that Site’s firing alerts; sections collapse so the brief stays one screen.
- LLM report only via explicit generate, as a normal Orchestrator Chat Contract turn (fixed prompt, current Site Binding, same conversation). One turn covers resource health and current firing alerts — not per-alert turns, not expand-to-generate, not a brief-JSON API. NextOps does not paint that turn in OPSGPT; Visual Summary / Detail Appendix live in the Site Health Brief ([ADR-0020](0020-diagnosis-answer-presentation.md)).
- Charts and alert lists may refresh; the generated Diagnosis Answer stays until the next generate, Site change, or room clear, with a stale-report notice if live data moved on.

## Considered Options

| Option | Outcome |
|--------|---------|
| Keep ` ```rca ` schema and revive the mock card | Contradicts ADR-0016; LangGraph does not emit the fence |
| Remove the left pane; chat only | Loses bound-site health scan without asking |
| Auto LLM on bind or first expand | Hidden turns; violates explicit generate |
| Unbound Site Resource Health for all Sites | Repeats the latency coupling ADR-0009 split avoided |
| Per-alert LLM turns or a brief-payload diagnose API | Conversation spam / second contract |

## Consequences

- Drop the ` ```rca ` parse path as the filler for the left pane.
- Site Health Brief reads dashboard/Tool Endpoint HTTP from the browser like other operator views; the orchestrator still gathers its own tool JSON for the generate turn.
- Bound layout and generate-turn visibility are in [ADR-0020](0020-diagnosis-answer-presentation.md) (Live Brief vs Generated Report region; hidden generate turn).
