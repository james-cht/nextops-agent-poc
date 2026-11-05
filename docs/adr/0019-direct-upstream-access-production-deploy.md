# ADR-0019: Production deploy applies Direct Upstream Access

## Status

Accepted

## Context

[Direct Upstream Access](../../CONTEXT.md) is the Production connectivity policy: a running NextOps process reaches Prometheus, Elasticsearch, MySQL, Alertmanager, and the Diagnosis Orchestrator without HTTP CONNECT proxy or tunnel routing.

Shipped templates already defaulted `PUBLIC_DEFAULT_PROXY_ENABLED` and `PUBLIC_MYSQL_PROXY_ENABLED` to off. That was not enough. A leftover Production env with fetch proxy on still won over compose interpolation. OPSGPT then sent Diagnosis Orchestrator traffic (in-cluster DNS) through the corporate proxy and failed. MySQL CONNECT can also stay on across deploys via a persisted Local Settings Store preference, independent of the fetch-proxy switch.

`docs/configuration.md` previously described Production as “templates default off; if proxy is on, warn and keep running.” That treats leftover on-state as a valid Production configuration.

This policy applies to every Production deploy path (shsdgx Image-Only Deploy, Helm, production compose). It does not change [ADR-0018](0018-shsdgx-image-only-deploy.md) (how shsdgx receives an image). Workstation image build may still use npm/Harbor `HTTP_PROXY`; that is not a runtime proxy.

## Decision

1. **A Production deploy applies Direct Upstream Access**, rather than only shipping false defaults. Leftover runtime-proxy-on state is not an implicit decision.
2. **Two independent runtime switches**, both applied off unless that environment **explicitly opted that switch in**: fetch proxy (`PUBLIC_DEFAULT_PROXY_ENABLED`) and MySQL CONNECT (`PUBLIC_MYSQL_PROXY_ENABLED`). No master “allow all runtime proxies” flag.
3. **Local Settings Store:** a Production **deploy** (not a process restart) turns off any persisted MySQL CONNECT preference unless this environment explicitly opted in. A Cluster Operator may enable MySQL CONNECT afterwards; that Runtime Setting survives restart until the next Production deploy.
4. **Process start does not hard-fail** if a runtime proxy is on (`NODE_ENV=production` still warns). Emergency override remains possible; it must be an explicit opt-in, not a forgotten file.
5. **Laptop `npm run dev`** and segmented networks may enable either switch when Direct Upstream Access is unavailable.

## Considered Options

| Option | Outcome |
|--------|---------|
| Template defaults only | Leftover env/store on-state silently stays Production |
| Apply both switches off at every Production deploy; per-switch explicit opt-in; store reset on deploy not restart (chosen) | Matches Direct Upstream Access; leftover cannot masquerade as policy |
| Hard-fail process start when production + proxy | Blocks emergency override; over-fits NODE_ENV=production including local production-mode runs |
| One master runtime-proxy flag | Recouples fetch and MySQL CONNECT; repeats the OPSGPT/fetch-proxy blast radius |
| Reset MySQL CONNECT on every process start | Makes the admin Runtime Setting useless across ordinary restarts |
| Disable workstation `HTTP_PROXY` for image build | Breaks npm/Harbor fetch on the corporate network; out of scope for runtime policy |

## Consequences

- Every Production deploy path must rewrite and assert the two env switches off unless that path’s explicit opt-in for the switch is set; Image-Only Deploy also clears leftover MySQL CONNECT preference in the Local Settings Store.
- Helm and production compose must apply the same policy as shsdgx — not a weaker “values default false, PVC/store may keep MySQL CONNECT on.”
- Operator docs (`docs/configuration.md`) describe **applied** Direct Upstream Access, not template-default-only.
- Image-build `HTTP_PROXY` / `HTTPS_PROXY` remain a workstation/build concern.
- Startup `proxy_init` warning stays for misconfiguration detection; it is not the enforcement mechanism.
