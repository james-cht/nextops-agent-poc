# ADR-0026: AI Diagnosis pane maximize / restore

## Status

Accepted and implemented on `/ai` (ratio split + Pane Maximize / restore for Site Health Brief ↔ OPSGPT). Layout-only; does not change Diagnosis Answer or Orchestrator Chat Contract.

## Context

On `/ai`, OPSGPT sits in a fixed-width narrow column (`~400px`) beside the Site Health Brief. Operators find the chat too small when reading long answers or Assistant Images, while the brief sometimes needs the full width when no chat focus is needed. Bounded Log Analysis’s Analysis Window ([ADR-0025](0025-bounded-log-analysis.md)) will need minimize / maximize / restore; the same **interaction idea** should apply to the two durable `/ai` panes without turning them into floating overlays.

## Decision

1. Site Health Brief and OPSGPT each support **Pane Maximize** (use the main content width) and **restore** to the previous split ratio.
2. Only one of the two panes is maximized at a time; maximizing one restores the other to the shared split.
3. Default split may widen OPSGPT beyond a hard 400px lock once Pane Maximize ships (exact default ratio is UI detail); operators who maximize/restore keep their last non-maximized ratio for the session (browser session is enough; not Local Settings Store).

## Considered Options

| Option | Outcome |
|--------|---------|
| Keep permanent 400px OPSGPT | Continues the “too small” complaint (current code) |
| Permanent 50/50 with no maximize | Better default, but no focus mode |
| Floating OPSGPT overlay | Conflicts with Site Health Brief as a durable sibling region |

## Consequences

- Default OPSGPT share is a ratio (~38%), not a hard 400px lock; maximize/restore keeps the last split for the browser session.
- Distinct from Analysis Window chrome on `/logs` ([ADR-0025](0025-bounded-log-analysis.md)), but same min/max/restore vocabulary for operators.
