# Ansible deploy for NextOps (shsdgx VM — Image-Only Deploy by default)

Legacy shell entrypoints remain under `scripts/` (`deploy-remote.sh`, `deploy-remote.ps1`).

## Prerequisites

- Ansible 2.14+ on the controller (WSL as user `james` recommended)
- SSH host `shsdgx` in `~/.ssh/config` with `User james`
- **Workstation:** `nerdctl` + BuildKit for local image build; `.env.prod.shsdgx` (or `.env.prod`) for build-time `PUBLIC_*` bake — never committed
- **Remote VM:** `nerdctl`, BuildKit; `~/repositories/nextops/.env.prod` for runtime secrets (never synced from laptop)

```bash
wsl -u james
cd /mnt/c/Users/james/repositories/nextops/ansible
export ANSIBLE_CONFIG="$PWD/ansible.cfg"
./deploy.sh
```

## Default: Image-Only Deploy (shsdgx only)

Per [ADR-0018](../docs/adr/0018-shsdgx-image-only-deploy.md):

1. Build image on **workstation** (uses `.env.prod.shsdgx` if present)
2. `nerdctl save` → scp tar + `docker-compose.yml` to shsdgx
3. Remote `nerdctl load` + `compose up -d --no-build`
4. Remove leftover `src/`, `docs/`, `README.md`, `workspace-guide.md`, `docs/agents/workspace-guide.md`, etc. Keep `.nextops-rollout.json` and previous `nextops:<tag>` images.

**Does not apply** to Kubernetes (Helm) or generic Docker/registry production.

App URL: `http://<host>:3003/` (override with `-e nextops_app_port=3000`).

## Modes

| Extra var | Values | Meaning |
|-----------|--------|---------|
| `nextops_mode` | `image_tar` (**default**), `rsync`, `remote_build` | Image tar vs dev source sync vs remote git pull |
| `nextops_run_method` | `compose` (**default**), `run` | `nerdctl compose up --no-build` vs three `nerdctl run` |
| `nextops_clean_remote_source` | `true` (default), `false` | Strip source/docs after image-only deploy |
| `nextops_mcp_enabled` | `true` (default), `false` | MCP Adapter on :3100 |
| `nextops_orch_enabled` | `true` (default), `false` | LangGraph orchestrator on :3200 |
| `nextops_force_direct_upstream_proxy_off` | `true` (**default**), `false` | [ADR-0019](../docs/adr/0019-direct-upstream-access-production-deploy.md): rewrite/assert runtime proxies off |
| `nextops_opt_in_fetch_proxy` | `false` (default), `true` | Explicit fetch-proxy opt-in (skip rewrite of `PUBLIC_DEFAULT_PROXY_ENABLED`) |
| `nextops_opt_in_mysql_proxy` | `false` (default), `true` | Explicit MySQL CONNECT opt-in (skip env rewrite and Local Settings Store reset) |
| `nextops_app_port` | `3003` (default) | Host/container port for NextOps |
| `nextops_image_tag` | string | Force image tag (default = `BUILD_SHA`) |

Examples:

```bash
# Production shsdgx (default)
./deploy.sh

# Dev: sync source and build on server (leaves source on VM)
./deploy.sh -e nextops_mode=rsync

# After GitHub push — pull on server and build (dev)
./deploy.sh -e nextops_mode=remote_build

# App only (no MCP / orchestrator)
./deploy.sh -e nextops_mcp_enabled=false -e nextops_orch_enabled=false

# Skip post-deploy cleanup
./deploy.sh -e nextops_clean_remote_source=false
```

## Workstation build env

Create `.env.prod.shsdgx` locally (gitignored) with `PUBLIC_*` aligned to shsdgx upstreams. Runtime passwords stay in the VM's `.env.prod` only.

## Inventory

Edit `inventory/hosts.yml`. Default host alias: `shsdgx`, user `james` (root refused).

## WSL `/mnt/c` note

DrvFs mounts under `/mnt/c` are often mode `777`. Ansible may ignore `./ansible.cfg`. Use `./deploy.sh` or `export ANSIBLE_CONFIG="$PWD/ansible.cfg"`.

## Why compose + `--no-build`

`nerdctl compose` v2.0.x ignores service `env_file:`. Compose interpolates `${VAR}` from project `.env` → `.env.prod`. Image-only deploy loads the pre-built tag then `compose up -d --no-build`.

## Restart after `.env.prod` changes

No image rebuild — recreate containers to pick up runtime env:

```bash
./scripts/restart-shsdgx-compose.sh
```

Requires `docker-compose.yml` and `.env.prod` on the VM (from a prior ImageTar deploy). Fails fast if `.env.prod` is missing.

## Roll back the previous image

After a bad ship, from WSL (same SSH as deploy):

```bash
../scripts/shsdgx-rollout.sh rollback
# or: ../scripts/rollback-remote.sh
```

Uses `.nextops-rollout.json` on the VM (current/previous `IMAGE_TAG`). Does not change Release Version. See [ADR-0032](../docs/adr/0032-keep-previous-image-rollback.md).
