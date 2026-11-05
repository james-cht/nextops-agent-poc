# ADR-0020: Diagnosis Answer presentation — Visual Summary, Detail Appendix, hidden generate turn

## Status

Accepted (narrows [ADR-0017](0017-site-health-brief.md) on where a generated report is shown; does not reopen [ADR-0016](0016-langgraph-diagnosis-orchestrator.md)’s “no machine-parsed diagnosis schema”)

## Context

A generated Diagnosis Answer is one Orchestrator Chat Contract turn ([ADR-0017](0017-site-health-brief.md)). NextOps was painting that same markdown as `pre-wrap` in both the Site Health Brief and OPSGPT, so `**headings**` showed as chrome, collapsible `<details>` overlapped, and the right pane was a second copy of the report instead of free Q&A.

Operators still want one generate turn and one answer — not a second LLM product and not a ` ```rca ` schema.

## Decision

1. **One generate turn, two presentation layers** in the Site Health Brief only: Visual Summary (tables, section chrome, Report Callouts) then an optional Detail Appendix after the Appendix Marker 「詳細資料」. Missing marker → whole answer is Visual Summary; appendix is absent. NextOps splits on that marker only.
2. **OPSGPT is free-form Q&A.** It does not paint the generate-report prompt or answer. Bound-site suggestion chips are 資源熱點 and 重啟風險 (not 運行狀態). Q&A uses the same heading / table / Report Callout chrome, without a Detail Appendix.
3. **Hidden generate turn:** generate-report still uses the Orchestrator Chat Contract and the same Diagnosis Conversation as OPSGPT, so follow-up questions can refer to the report. NextOps stores the turn and does not show it on the right.
4. **Bound Site Health Brief layout:** sibling Live Brief (saturation, hotspots, firing alerts) and Generated Report region — they must not overlay. With a generated answer present, the Live Brief is height-capped and scrolls internally so the report region keeps a usable remainder. Generate does not change which Live Brief blocks are open. Detail Appendix starts collapsed at the end of the report region.
5. **Report Callouts** are the fixed kinds 重點 / 提示 / 風險 / 建議, mapped by NextOps to small status icons. Distinct from Assistant Images. Not model emoji as heading chrome. Not a findings JSON schema.

## Considered Options

| Option | Outcome |
|--------|---------|
| Two LLM products (structured visual + prose) | Second contract / schema; contradicts ADR-0016 |
| Paint generate-report in OPSGPT as well | Right pane is not free Q&A |
| Isolated conversation for generate | Follow-ups cannot refer to the report |
| Heuristic “first N paragraphs” as the appendix split | Unstable |
| Exclusive accordion (only one left-pane block open) | Hides Live Brief saturation while reading the report |
| Auto-collapse Live Brief on generate | Feels like live data vanished |
| Model emoji as UI chrome | Unstable; not Lucide / status-colored callouts |

## Consequences

- Change the generate prompt to emit Visual Summary then the Appendix Marker; restyle in NextOps rather than `pre-wrap`.
- Hide the generate turn in the OPSGPT transcript; keep it in the Diagnosis Conversation Store.
- Replace competing flex `<details>` with Live Brief + Generated Report region (cap when a report exists).
