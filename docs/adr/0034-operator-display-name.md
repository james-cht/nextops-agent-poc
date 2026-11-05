# ADR-0034: Fixed Operator Display Name (not a custom personnel-field schema)

## Status

Accepted; implemented. Glossary: `CONTEXT.md` — Operator Display Name, Username, Operator Email, Operator Account, Operator Chat, OPSGPT Participant. Extends identity surface of [ADR-0027](0027-operator-accounts.md); does not reopen Site-scoped roles or company directory sync.

## Context

Platform Owners need a human-readable name on Operator Accounts (帳號安全「姓名」) so Cluster Operators can recognize who a Username is. A tempting generalization is a Platform Owner–managed catalog of arbitrary personnel fields. That would be a second settings product beside Runtime Settings and would fight ADR-0027’s small, fixed identity model (Username + Operator Email + one Operator Role). Operator Chat and the header already show Username; adding a display label without a clear mention key would also collide with the reserved OPSGPT Participant display name.

## Decision

1. **One fixed field: Operator Display Name.** Platform Owner sets it at create and may change it later on the account detail. The owning Operator Account must not edit it (same ownership as Operator Email). Not unique; trimmed length 1–64 when set; must not equal `OPSGPT` (case-insensitive). No Platform Owner UI to invent additional personnel attribute definitions.

2. **Required on create; empty only as legacy/bootstrap.** New accounts must have a non-empty Display Name. Accounts that predate the field, and the env-seeded first Platform Owner, may leave it empty until filled. Once set, it must not be cleared back to empty. No new required bootstrap env for the display name.

3. **Display vs identity stay split.** Accounts list shows and searches Display Name (with Username and Operator Email). Header control label prefers Display Name (fallback Username); Username remains in the tooltip. Operator Chat message/roster labels prefer Display Name (fallback Username); **@ mentions and audience identity stay on Username.** Diagnosis Traces and Sessions continue to key by Username.

## Considered Options

| Option | Outcome |
|--------|---------|
| Fixed Operator Display Name (chosen) | Covers the real ask (姓名) without a mini-HRIS |
| Owner-defined custom personnel fields | Hard to reverse; type/required/search/migration debt; rejected |
| Unique display names | Homonyms are normal; uniqueness belongs to Username / Operator Email |
| Self-service edit of display name | Nicknames drift from Owner-maintained roster; rejected |
| Use Display Name as @ mention key | Ambiguous when names collide; breaks when the name changes; rejected |
| Require display name on env seed | Blocks break-glass deploy for a non-auth field; rejected |

## Consequences

- Local Settings Store Operator Account rows gain an Operator Display Name column (nullable for legacy/seed).
- Account admin create/detail/list/search, header chrome, and Operator Chat labels must resolve Display Name with Username fallback; mention parsing does not.
- Do not ship a “personnel field definitions” admin surface in this phase. If a second fixed identity attribute is later needed, grill it as another fixed field (or reopen this ADR), not as a generic schema.

## References

- [ADR-0027](0027-operator-accounts.md)
- [ADR-0029](0029-operator-chat.md)
- `CONTEXT.md` — Operator Display Name
