# ADR-0012: Local Settings Store (SQLite)

## Status

Accepted for the Local Settings Store. Dashboard **login identity** is Operator Accounts ([ADR-0027](0027-operator-accounts.md)). A leftover `admin_credential` row may still exist for bootstrap seed and password-based Runtime Setting step-up until that step-up moves to TOTP.

## Context

ADR-0011 made credentials and related knobs Runtime Settings with step-up confirmation, but password re-entry was embedded in the AI Agents form, login still depended only on process env (`NEXTOPS_ADMIN_*`), and durable state lived as ad-hoc `.data/*.json` files.

## Decision

Introduce a **Local Settings Store**: an on-process SQLite database (under `.data/`) that NextOps opens at startup. It is the durable home for:

- **Operator Accounts, Sessions, and Login Events** ([ADR-0027](0027-operator-accounts.md))
- **Runtime Settings** — Tool Endpoint Token override, AiBridge-related settings, Model Rate Table, MySQL CONNECT preference (not Dify Chat Credentials as a live orchestrator path; see [ADR-0023](0023-retire-dify-orchestrator-fallback.md))
- **Config Audit Log**
- **Smart Logging preferences** — Index Watchlist / Log Categories / last active pattern ([ADR-0022](0022-smart-logging-preferences-local-settings-store.md))
- **Legacy `admin_credential`** — transitional only (seed / password step-up), not the Operator Account model

Deployment env remains bootstrap and break-glass (first Platform Owner when no Operator Account exists). Existing `.data` JSON/jsonl Runtime Setting files may be imported once on first open. Runtime API secrets in SQLite are not application-encrypted in this phase (filesystem controls). Single-instance only; Jenkins `DB_*` MySQL remains the pipeline metrics source, not NextOps settings.

**Considered options:** keep Admin password fields inside AI Agents (wrong ownership); reuse Jenkins MySQL for settings (couples ops config to pipeline DB); remote settings DB/Redis (multi-replica, out of scope); re-seed from env on every boot (makes account changes useless); argon2 (stronger but native deps); encrypt Runtime secrets with `NEXTOPS_SETTINGS_KEY` (deferred).

**Consequences:** Auth and Runtime Setting codepaths read the Local Settings Store; JSON-backed stores are imported then retired; document deleting the sqlite file to re-seed; ADR-0011 probe/mask/audit rules remain for the Tool Endpoint Token path; Operator account UX is `/admin/account` (Operator Accounts + self-service), not a singular Admin Credential panel.
