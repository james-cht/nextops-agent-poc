# ADR-0027: NextOps-native Operator Accounts

## Status

Accepted target; **partially implemented**. Opaque Operator Sessions and multi-account roles are live. Singular `admin_credential` remains for Runtime Setting password step-up and bootstrap seed. Mandatory TOTP-before-dashboard, Recovery Codes, and TOTP step-up are **not** fully enforced yet. Supersedes the singular Admin Credential *as the login identity* in [ADR-0012](0012-local-settings-store.md); the Local Settings Store itself remains.

## Context

[ADR-0012](0012-local-settings-store.md) stored one Admin Credential (`id = 1`) and login once set a boolean cookie `session=authenticated`. That cannot attribute Config Audit Log or Diagnosis Traces to a person, cannot revoke a device, and cannot record Client IP or login history. Company SSO is not available on this ops network in this phase; Gateway Employee Id is a shared LLM whitelist, not a NextOps login.

## Decision

Replace Admin Credential **as the dashboard login identity** with **Operator Accounts** that NextOps issues and verifies (Lasting Password hashed with scrypt, plus a TOTP Second Factor). Env seeds the first Platform Owner only when no Operator Account exists.

- **Identity:** immutable Username (login key) and required unique Operator Email (contact only — not login, not mail, not recovery). One Operator Role per account: Platform Owner, Operator, or Viewer — global, not Site-scoped.
- **Lifecycle (target):** Platform Owner creates accounts with a system-generated Temporary Password (shown once). First login must set a Lasting Password (minimum 12 characters, not equal to Username) then enroll TOTP and receive Recovery Codes. Disable, do not delete; Username and Operator Email stay reserved. Last Platform Owner cannot be disabled or demoted. Unique Owner lockout with no Recovery Codes is still wipe-the-store / env re-seed.
- **Session (shipped):** opaque server Session id in the Local Settings Store (cookie value = `operator_session.id`; survives process restart). SSE is activity, not a Session. Idle 8h, absolute 24h. Login Events retained; Client IP from TCP peer unless a trusted reverse proxy is configured (`NEXTOPS_TRUSTED_PROXY`). Login Lockout is 5 failures / 15 minutes per username.
- **Step-up (transitional in code):** target is fresh TOTP for Runtime Settings and high-risk Owner actions. **Current code** uses `AdminStepUpModal` + `verifyStepUpPassword`, which accepts leftover `admin_credential` **or** an enabled Platform Owner Lasting Password (so changing one’s login password does not break Runtime Setting saves). Changing one’s own password is Operator self-service.

### Implementation snapshot (keep honest)

| Piece | Code today |
|-------|------------|
| Opaque Session cookie → store | Done (`/api/auth/login`, `hooks.server.ts`) |
| Operator Accounts + roles + admin UI | Done |
| Username lockout 5/15m | Done |
| TOTP | Optional until enrolled — not a hard gate before every dashboard use |
| Recovery Codes | Not shipped as the ADR target describes |
| IP throttle (beyond username lockout) | Not the full ADR target |
| Runtime Setting step-up | Password step-up accepts leftover `admin_credential` **or** any enabled Platform Owner Lasting Password (`verifyStepUpAgainstStore`); target remains TOTP |
| Parallel `admin_credential` row | Still seeded for step-up / migration |

## Considered Options

| Option | Outcome |
|--------|---------|
| Native Operator Accounts (chosen) | Fits isolated ops networks; SSO/passkeys can attach later to the same account |
| Company IdP as source of identity | Cleaner 2FA story; no reachable IdP on this deployment path |
| Keep singular Admin Credential + break-glass admin | Unattributable audit; defeats login IP / Session tracking |
| Site-scoped roles | Requires a data-plane tenant boundary we do not have (shared Tool Endpoint Token) |
| Third-party CAPTCHA | Login depends on outbound Google/Cloudflare; fails on `10.x` / isolated browsers |
| Session = SSE/HTTP connection | Wall monitors inflate “who is logged in”; logout would kill log streams |
| Memory-only Sessions | Every deploy logs out the Alert Center wall |
| Hard-delete accounts | Username reuse poisons audit; Traces go unattributed |

## Consequences

- Login cookie **is** an opaque Session id checked against the Local Settings Store (no longer `authenticated`).
- Finish retiring `admin_credential`: move Runtime Setting step-up to TOTP ([ADR-0011](0011-runtime-dify-credentials.md) behavioral rules still apply to Tool Endpoint Token).
- Local Settings Store holds Operator Accounts, Sessions, Login Events, Smart Logging prefs, Runtime Settings, Config Audit Log; deleting the sqlite file remains break-glass (no Operator Accounts → env seeds the first Platform Owner).
- Tool Endpoint Token stays a machine secret, not an Operator Account.
- Diagnosis Traces ([ADR-0024](0024-diagnosis-trace-observability.md)) record the initiating Username; only a Platform Owner may read them.
- Operator Display Name (human label; not login / not @ mention key) is a fixed identity field — [ADR-0034](0034-operator-display-name.md), not a custom personnel-field schema.
