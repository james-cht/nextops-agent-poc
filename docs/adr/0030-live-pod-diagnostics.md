# ADR-0030: NextOps triggers Live Pod Diagnostics; occupancy is NextOps; results stay in Robusta Store

## Status

Accepted and implemented on `/logs` (`evaluateLivePodDiagnosticsSelection`, Local Settings Store occupancy, `/api/logs/live-pod-diagnostics`, Live Pod Diagnostics Window). Does not change Bounded Log Analysis ([ADR-0025](0025-bounded-log-analysis.md)), the Robusta History read model ([ADR-0028](0028-robusta-store-second-mysql.md)), or Document Filter Log Namespace / Log Pod paths ([ADR-0013](0013-log-index-factory-code-routing.md)).

## Context

Smart Logging already sends a bounded log selection through the Orchestrator Chat Contract into an Analysis Window ([ADR-0025](0025-bounded-log-analysis.md)). Operators also need a **live Kubernetes pod** diagnosis from Robusta for one selected log row. That is a different product: Robusta runs `k8s_pod_diagnostics` asynchronously and writes a row keyed by `task_id`; it is not a Diagnosis Answer and not a Robusta Investigation on `/robusta`.

ADR-0028 established the Robusta Store as a **read** upstream for Investigations (`k8s_*_logs` or an investigation/step pair, filtered by Robusta Cluster Key). A future reader would assume NextOps never calls Robusta and never reads tables outside that History mapping.

## Decision

1. **Capability:** Live Pod Diagnostics（應用即時狀態分析） is its own Smart Logging action. One selected buffer row whose **namespace and pod values** resolve from a fixed field-path allowlist (first non-empty): `kubernetes.namespace_name` / `kubernetes.pod_name`, then `k8s.namespace` or `k8s.nameSpace`, then `k8s.podName`. Occupancy is Site + those **values**, not the field-path name. Non-K8s rows and rows that yield no pair are refused. This does **not** rewrite Document Filter Log Namespace / Log Pod ([ADR-0013](0013-log-index-factory-code-routing.md)). Requires Robusta Coverage; does not require a Robusta Cluster Key. Viewer may read, not start. Result surface is a **Live Pod Diagnostics Window**, which may sit beside an Analysis Window and must not paint a Diagnosis Answer.
2. **Trigger, don't write:** NextOps backend `POST`s Robusta's action trigger API (`action_name: k8s_pod_diagnostics`) with a NextOps-generated Live Pod Diagnostics Task id. The Robusta Action Token and trigger URL are deploy env, like Store credentials — not a Runtime Setting, not the browser, not a Tool Endpoint. NextOps never `INSERT`s diagnostics or Investigation rows; Robusta writes the Store.
3. **Read by Task id:** After trigger accept, NextOps reads that Task's row from the same Robusta Store MySQL by `task_id`. This is not the five-table History mapping and is not filtered by Robusta Cluster Key.
4. **Occupancy is NextOps:** Shared Local Settings Store mapping (Site + resolved namespace value + resolved pod value → Task id), not per Operator Account and not per ES `_id`. Occupancy starts only after Robusta accepts the trigger; it ends only when the Store row is terminal success or failure. NextOps does not invent a timeout unlock. Same pod cannot have two in-flight Tasks.

## Considered Options

| Option | Outcome |
|--------|---------|
| Fold into Bounded Log Analysis / Analysis Window | Wrong contract (Orchestrator vs Robusta); rejected in CONTEXT |
| Treat as a Robusta Investigation on `/robusta` | History is past Store events, not a live pod trigger |
| Occupancy only in Robusta Store | Trigger body has no ES identity; Store cannot key “same pod” occupancy for NextOps operators |
| NextOps `INSERT` into the diagnostics table | Splits write ownership; rejected — Robusta owns Store rows |
| Fuzzy-scan any field path containing “pod” / “namespace” | Hits `k8s.podIP` and similar; rejected |
| Rewrite ADR-0013 Document Filter paths to `k8s.*` | Mixing trigger identity with filter paths; rejected |

## Consequences

- ADR-0028's Investigation list, Snapshot, and Cluster Key filter stay as they are. Live Pod Diagnostics adds a second **read** shape on that pool plus a new NextOps→Robusta HTTP trigger client.
- Local Settings Store ([ADR-0012](0012-local-settings-store.md), [ADR-0022](0022-smart-logging-preferences-local-settings-store.md)) gains **shared** pod occupancy, unlike per–Operator Account Watchlist / Log Categories.
- The Diagnosis Orchestrator does not receive a Tool Endpoint that opens the Robusta Store or the trigger API.
