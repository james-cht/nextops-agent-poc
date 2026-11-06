# ADR-0018: Image-Only Deploy to shsdgx VM

## Status

Accepted

## Context

NextOps is deployed to an internal **shsdgx** VM via nerdctl/containerd. Earlier flows rsynced the full git working tree (including `src/`, `docs/`, markdown) and built the image **on the server**. That conflicts with operational goals:

- Production VM should not hold source code or agent/context documentation (`README.md`, `workspace-guide.md`, `workspace-guide.md`, `docs/`, etc.).
- Runtime secrets (`.env.prod`) must stay on the VM and must not be scp'd from a laptop.
- SvelteKit still requires a build-time env file to bake `PUBLIC_*` into the client bundle; that file must align with shsdgx upstream URLs but is stripped from the final image layer.

Other production targets — **Kubernetes (Helm)** and generic **Docker/registry** deployments — use registry push, charts, and their own env policies. This ADR does **not** apply there.

## Decision

1. **Image-Only Deploy** is the **default** path for shsdgx: build on the operator workstation (WSL), `nerdctl save`, scp the tar plus `docker-compose.yml`, `nerdctl load` on the VM, `compose up -d --no-build`.
2. **Transfer boundary:** only the image tar and minimal runtime files (`docker-compose.yml`, server-side `.env.prod`, `.env` → `.env.prod` symlink). No `src/`, `docs/`, `ansible/`, or markdown/agent context files.
3. **Build-time env:** workstation copy (prefer `.env.prod.shsdgx`, else `.env.prod`); never committed, never rsynced/scp'd to shsdgx. Runtime env remains the VM's existing `.env.prod`.
4. **Image tag:** `nextops:<BUILD_SHA>` and `nextops-<BUILD_SHA>.tar` (12-char git short or dirty-tree fingerprint).
5. **Post-deploy cleanup:** after a successful Image-Only deploy, remove leftover source/docs trees on the VM if present from earlier rsync/git flows.
6. **Services:** default start app + MCP Adapter + LangGraph orchestrator (same image, three containers); opt-out via `nextops_mcp_enabled` / `nextops_orch_enabled` or compose scale.
7. **Development opt-in:** `rsync` and `remote_build` modes remain for pre-push iteration; they are not the shsdgx production default.

## Out of scope

- Kubernetes / Helm (`charts/nextops/`)
- Harbor/registry-based production outside shsdgx VM
- Bundling documentation or agent skills on the deployment target

## Considered Options

| Option | Outcome |
|--------|---------|
| Image tar + minimal runtime files (chosen) | Smallest VM footprint; secrets stay on VM |
| rsync source + remote build (previous default) | Exposes source/docs on VM; rejected for production |
| Remote git pull + build | Same footprint problem; dev-only |
| scp zip of filtered source | Still ships unnecessary files; rejected |

## Consequences

- Ansible default `nextops_mode: image_tar`; `scripts/deploy-remote.sh` default `MODE=ImageTar`.
- Operators maintain `.env.prod.shsdgx` locally for builds and `.env.prod` on shsdgx for runtime.
- `CONTEXT.md` term **Image-Only Deploy (shsdgx VM only)** documents the boundary.
- K8s and generic Docker docs unchanged; they reference Helm/registry paths.
- Keep-previous + rollback of `IMAGE_TAG` (not Release Version): [ADR-0032](0032-keep-previous-image-rollback.md).

## References

- [Deployment Guide](../deployment.md#shsdgx-vm-image-only-deploy)
- [ansible/README.md](../../ansible/README.md)
- ADR-0015 (MCP Adapter), ADR-0016 (LangGraph orchestrator) — same image, optional services
