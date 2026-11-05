# ADR-0035: Public URL is a shared-host path prefix; TLS stays on the existing reverse proxy

## Status

Implemented. Glossary: `CONTEXT.md` — Public URL, Public Host, Public Base Path, Tool Endpoint Base URL, Client IP, Session, GitLab OAuth Client. Does not rewrite [ADR-0001](0001-single-sveltekit-service.md) (Node still serves HTTP), [ADR-0018](0018-shsdgx-image-only-deploy.md) (Image-Only does not ship Nginx), [ADR-0019](0019-direct-upstream-access-production-deploy.md) (this is browser ingress, not NextOps→upstream CONNECT), or [ADR-0033](0033-application-catalog-gitlab.md) (OAuth redirect still follows the Public URL, not a Runtime Setting).

## Context

Cluster Operators reach NextOps on plain HTTP at a host:port. The first HTTPS path available is an existing shared Nginx (`tmdev.corp.example.com`) that mounts apps as path prefixes, not a dedicated `server_name` at `/`. Putting TLS in the Node process, or shipping Nginx inside Image-Only Deploy, would move certificate and `location` ownership into the NextOps image boundary. Treating Public Host or Public Base Path as a Runtime Setting would let SRE admin change the operator entry without Nginx or GitLab following.

## Decision

1. **One Public URL** per deploy, on a shared host: HTTPS + Public Host + Public Base Path. The first shared-host shape is Public Base Path `/nextops`. The app-root form includes a trailing slash; Nginx redirects `/nextops` to `/nextops/`. The old HTTP host:port is not an operator entry. Laptop `npm run dev` keeps an empty Public Base Path.

2. **TLS terminates on the existing reverse proxy.** NextOps does not deploy that Nginx. The proxy must forward `/nextops/...` to the Node process **without stripping the prefix**, set `X-Forwarded-Proto` / `Host` / `For` (overwrite client-supplied For), and disable proxy buffering on SSE paths. That proxy is the trusted reverse proxy for Client IP on this deploy.

3. **One process, one prefix.** SvelteKit Public Base Path is bake-time deploy env (like `PUBLIC_*`); Public Host is runtime deploy env. Neither is a Runtime Setting. In-cluster callers on that image (health, Tool Endpoint Base URL, direct webhooks) use the same prefix on the Node port. MCP Adapter and Diagnosis Orchestrator listen ports are not under the Public URL.

4. **GitLab OAuth redirect follows the Public URL.** It is not registered until that deploy enables GitLab OAuth. Do not keep a second operator-facing redirect for the old HTTP entry.

## Considered Options

| Option | Outcome |
|--------|---------|
| Shared-host `/nextops`, existing Nginx, no strip, deploy env (chosen) | Matches the gateway we can change; one bake per prefix |
| Dedicated host at `/` | Smaller app change; not available for the first HTTPS path |
| Node process terminates TLS | Certificates inside the image; rejected |
| Nginx inside Image-Only Deploy | Breaks ADR-0018 transfer boundary |
| Public URL as a Runtime Setting | Admin cannot move Nginx or GitLab; rejected |
| Strip prefix so Node stays at `/` | Browser `/api` and `/_app` miss `location /nextops/`; SvelteKit `paths.base` then 404s on stripped paths |
| Runtime prefix with no image rebuild | Every absolute `/api` / SSE / cookie path must follow a live prefix; deferred |
| Dual operator entries (HTTPS prefix + HTTP IP:port) | Split Sessions, CSRF, and GitLab redirect; rejected |

## Consequences

- Session cookie `path` is the Public Base Path on a shared host, not `/`.
- Image-Only build env bakes Public Base Path; VM runtime env sets Public Host (`ORIGIN` as scheme+host, no path) and trusted-proxy. Changing prefix requires a new image, not a source commit of a hostname.
- Before switching an image to a non-empty prefix, inventory callers of the Node port (Alertmanager webhook, Jenkins Runtime Check, probes). Compose sidecars are in-repo; external POSTs are a cutover gate.
- Helm / dedicated-host deploys may keep an empty Public Base Path. This ADR does not require every environment to use `/nextops`.

## References

- [ADR-0001](0001-single-sveltekit-service.md)
- [ADR-0018](0018-shsdgx-image-only-deploy.md)
- [ADR-0019](0019-direct-upstream-access-production-deploy.md)
- [ADR-0027](0027-operator-accounts.md) — trusted reverse proxy / Client IP
- [ADR-0033](0033-application-catalog-gitlab.md)
- `CONTEXT.md` — Public URL, Public Host, Public Base Path
