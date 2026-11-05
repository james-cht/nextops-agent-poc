# Separate MySQL upstream for Robusta Store

**Status:** Accepted  
**Glossary:** `CONTEXT.md` — Robusta Store, Robusta History, Pipeline Metrics, Direct Upstream Access, Runtime Setting, Local Settings Store, Tool Endpoint

NextOps already reads Pipeline Metrics from one MySQL (`jenkins_build_info` via `DB_*`). Robusta Investigations live in a different database. **Robusta Store** is a second MySQL connection with its own deploy env, so pipeline KPIs and Robusta History do not share credentials, schema, or outage blast radius. Credentials are not a Runtime Setting and not stored in the Local Settings Store. Direct Upstream Access applies to this pool the same as Pipeline Metrics MySQL. Both pools share the existing MySQL CONNECT Runtime Setting — there is no third Robusta-only CONNECT switch. The Diagnosis Orchestrator does not receive a Tool Endpoint that opens the Robusta Store.

**Why not.** Reusing `DB_*` would couple Jenkins schema to Robusta history and make a Pipeline Metrics outage look like a Robusta outage (and vice versa). Putting the password in Runtime Settings would expose a second database secret on the SRE admin path; Pipeline Metrics already uses deploy env. A separate CONNECT toggle would split one network policy into two knobs operators would leave mismatched.

## Physical mapping

`ROBUSTA_DB_NAME` is the MySQL database (for example `ai-ops`), not a table. The default read model is five `k8s_*_logs` tables filtered by `cluster_id` = Robusta Cluster Key. Cluster Operations Snapshot and generate exemplars read the same tables with compact columns — they do not select stored `ai_diagnosis` or heap/thread/app log blobs. `ROBUSTA_STORE_SCHEMA` JSON may switch to an `investigation` + `investigation_step` pair when that is the actual Store.
