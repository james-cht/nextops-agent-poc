# Deployment Guide

NextOps runs as a single Node.js process built with `@sveltejs/adapter-node`. The production image serves UI and API on port 3000. The same image also contains the **Tool Endpoint MCP Adapter** (`node mcp-adapter/dist/index.js` on port 3100) for Dify Agent tools ([ADR-0015](adr/0015-tool-endpoint-mcp-adapter.md)) and the LangGraph orchestrator. The **daily check report** is a separate Python image (`daily-check-report/Dockerfile`, port 3300) ([ADR-0039](adr/0039-daily-check-report.md)).

## Prerequisites

- Access to Prometheus/Thanos and Elasticsearch endpoints from the deployment network
- MySQL with the `jenkins_build_info` table (required for pipeline KPIs on `/` and timeout drill-down at `/pipelines/timeouts`)
- LangGraph Diagnosis Orchestrator sidecar reachable at `ORCH_BASE_URL` (AI Diagnosis)
- Environment variables configured (see [Configuration Reference](configuration.md))

### Upstream connectivity matrix

| Upstream | Env vars | Features affected if unreachable |
|----------|----------|----------------------------------|
| Prometheus / Thanos | `PUBLIC_DEFAULT_PROMETHEUS_URL`, per-site URLs in site config | Global KPIs, site cards, alert trend fallback |
| Elasticsearch | `ES_BASE_URL`, optional `PUBLIC_DEFAULT_ELASTICSEARCH_*` | Smart Logging, ES query tools |
| MySQL | `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Pipeline success/timeout KPIs, `/api/pipeline-timeouts` |
| LangGraph orchestrator | `ORCH_BASE_URL`, `AIBRIDGE_*`, `NEXTOPS_DIFY_TOKEN` | AI Diagnosis (`/ai`) only |
| daily-check-report | `DAILY_CHECK_BASE_URL`, service `PROMETHEUS_URL` (from `PUBLIC_DEFAULT_PROMETHEUS_URL`) | 運維點檢 (`/ops-check`) |

Without reachable upstreams, affected surfaces show explicit error states (red borders, fetch-failure messages) — there is no embedded fallback dataset.

## Docker

### Build

```bash
docker build -t nextops:latest .
```

Or with nerdctl:

```bash
nerdctl build -t nextops:latest .
```

### Run

```bash
docker run --rm -p 3000:3000 --env-file .env nextops:latest
```

To also run the MCP Adapter in a second container from the same image (local dual-process):

```bash
docker run --rm -p 3000:3000 --env-file .env --name nextops nextops:latest
docker run --rm -p 3100:3100 --env-file .env --network container:nextops \
  -e NEXTOPS_TOOL_BASE=http://127.0.0.1:3000 \
  nextops:latest node mcp-adapter/dist/index.js
```

Helm charts enable the Adapter as a **sidecar** by default (`mcpAdapter.enabled`). Dify MCP URL: `http(s)://<host>:3100/mcp`.

### Health check

`GET /api/health` returns `{"status":"ok"}` — used by Docker `HEALTHCHECK` and Kubernetes probes.
MCP Adapter: `GET /health` on port 3100.

## Docker Compose / nerdctl compose

A `docker-compose.yml` is provided for local containerized runs. It builds the app image and maps port 3000.

```bash
cp .env.example .env
# Edit .env with reachable upstream URLs

nerdctl compose up --build
# or: docker compose up --build
```

See [Local Development](local-development.md) for nerdctl/containerd compatibility notes.

Compose runs NextOps, the MCP adapter, the LangGraph orchestrator, and `daily-check-report`. Prometheus, Elasticsearch, MySQL, and Gmail/Chat are external. `PROMETHEUS_URL` on the daily-check service is interpolated from `PUBLIC_DEFAULT_PROMETHEUS_URL`. Gmail and Google Chat stay in the environment; they are not image build args.

Image-only shsdgx deploys also need the `daily-check-report:<tag>` image loaded on the VM (`nextops_daily_check_image`). Ansible can scale the compose service to 0 with `nextops_daily_check_enabled=false`.

## Remote deploy (shsdgx VM — Image-Only Deploy)

**Default for shsdgx:** build on the operator workstation, transfer **only** the image tar and `docker-compose.yml`. Do **not** rsync source code, `docs/`, or agent/context markdown (`README.md`, `workspace-guide.md`, `workspace-guide.md`). Runtime `.env.prod` stays on the VM. See [ADR-0018](adr/0018-shsdgx-image-only-deploy.md).

**Not applicable:** Kubernetes (Helm) and generic Docker/registry production — use [Kubernetes (Helm)](#kubernetes-helm) below.

### Quick start (shsdgx)

```bash
wsl -u james
cd /mnt/c/Users/james/repositories/nextops

# 1. Workstation: build-time env (PUBLIC_* aligned with shsdgx; gitignored)
cp .env.example .env.prod.shsdgx   # edit; never commit

# 2. VM: runtime secrets (once)
ssh shsdgx 'cd ~/repositories/nextops && cp .env.example .env.prod && $EDITOR .env.prod'

# 3. You publish (agent does not). Type PUBLISH at the prompt.
./scripts/shsdgx-rollout.sh status
./scripts/shsdgx-rollout.sh publish
# or: ./scripts/deploy-remote.sh
# or: cd ansible && ./deploy.sh
```

Transfer boundary:

| Sent to shsdgx | Stays on workstation | Stays on VM only |
|----------------|----------------------|------------------|
| `nextops-<BUILD_SHA>.tar` | `.env.prod.shsdgx` (build bake) | `.env.prod` (runtime) |
| `docker-compose.yml` | Source, docs, `*.md` | — |

After deploy, leftover `src/` / `docs/` trees on the VM are removed if present.

### Development opt-in (not production footprint)

```bash
MODE=Rsync ./scripts/deploy-remote.sh          # rsync + remote build
MODE=RemoteBuild ./scripts/deploy-remote.sh   # git pull on server + build
```

### Prerequisites (shsdgx)

- WSL user **`james`** (not root); SSH alias `shsdgx`
- Workstation + VM: `nerdctl`, BuildKit
- VM: `~/repositories/nextops/.env.prod` (runtime; never scp from laptop)
- Workstation: `.env.prod.shsdgx` preferred for local build (`PUBLIC_*`)

### Image tag

`BUILD_SHA` — clean git → 12-char `HEAD`; dirty tree → content fingerprint. Image: `nextops:<BUILD_SHA>`, tar: `nextops-<BUILD_SHA>.tar`. Successful deploys pin `IMAGE_TAG=` in the VM `.env.prod` and keep the previous `nextops:<tag>` image ([ADR-0032](adr/0032-keep-previous-image-rollback.md)).

### Verify

```bash
ssh shsdgx "curl -fsS http://127.0.0.1:3003/api/health"
ssh shsdgx "cd ~/repositories/nextops && nerdctl compose logs --tail 50 nextops"
```

### Publish (operator, not agent)

After a Release is implemented (including Application Catalog / GitLab Registration for `1.3.0`), **you** publish. Image-Only Deploy builds `nextops:<BUILD_SHA>` on the workstation and loads it on shsdgx. It does not bump Release Version by itself — Version only changes when new Release Notes ship in that image (ADR-0031).

```bash
# WSL
./scripts/shsdgx-rollout.sh status
./scripts/shsdgx-rollout.sh publish    # type PUBLISH
```

```powershell
# Windows → WSL
.\scripts\shsdgx-rollout.ps1 status
.\scripts\shsdgx-rollout.ps1 publish
```

### Roll back the previous image

If a ship is bad, return compose to the previous `IMAGE_TAG` (BUILD_SHA). This is **not** changing Release Version; the previous image still shows the Release Version baked into that image. A second rollback (or a later publish) can move forward again.

```bash
# WSL
./scripts/shsdgx-rollout.sh status
./scripts/shsdgx-rollout.sh rollback   # type ROLLBACK
# same as: ./scripts/rollback-remote.sh
```

```powershell
.\scripts\shsdgx-rollout.ps1 rollback
```

Requires a previous tag in `~/repositories/nextops/.nextops-rollout.json` and that `nextops:<previous>` still on the VM (or `nextops-<previous>.tar` on the workstation). Do not prune old nextops images after deploy.

### Restart after `.env.prod` changes (no rebuild)

When only runtime secrets or upstream URLs in **shsdgx `.env.prod`** change, recreate containers without rebuilding or reloading the image:

```bash
# from WSL
chmod +x scripts/restart-shsdgx-compose.sh
./scripts/restart-shsdgx-compose.sh
```

The script (compose-only):

1. SSH to shsdgx and **fail** if `.env.prod` is missing
2. `ln -sfn .env.prod .env`
3. `nerdctl compose up -d --no-build --force-recreate` (all services)
4. Health-check app (`/api/health`), MCP (`:3100/health`), orchestrator (`:3200/health`)

`IMAGE_TAG` resolution (first match wins): `IMAGE_TAG=` in `.env.prod` → image from any nextops container (`ps -a`) → newest `nerdctl images nextops` tag. Image-Only Deploy and rollback write `IMAGE_TAG=<sha>` into `.env.prod` so restart stays on the pin.

Overrides: `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_REMOTE_DIR`, `PORT`, `MCP_PORT`, `ORCH_PORT`.

**Note:** Changes to `PUBLIC_*` baked at **image build** time still require a full ImageTar deploy (`.env.prod.shsdgx` on workstation + `./deploy.sh`).

### Legacy notes

Ansible playbook: [`ansible/README.md`](../ansible/README.md). `nerdctl compose` v2.0.x ignores `env_file:` — use `environment:` + `.env` → `.env.prod` symlink.

<details>
<summary>Previous rsync-default flow (deprecated for shsdgx production)</summary>

Remote build via rsync or git pull remains available for development via `nextops_mode=rsync|remote_build` or `MODE=Rsync|RemoteBuild`. It is no longer the recommended shsdgx production path.

</details>

## Kubernetes (Helm)

Chart location: `charts/nextops/`

### Install

```bash
# Build and push image to your registry
docker build -t your-registry/nextops:0.1.0 .
docker push your-registry/nextops:0.1.0

# Create a production values override (never commit real secrets)
cat > my-values.yaml <<'EOF'
image:
  repository: your-registry/nextops
  tag: "0.1.0"

ingress:
  enabled: true
  className: nginx
  annotations:
    nginx.ingress.kubernetes.io/proxy-buffering: "off"
  hosts:
    - host: nextops.example.com
      paths:
        - path: /
          pathType: Prefix

config:
  origin: "https://nextops.example.com"
  esBaseUrl: "https://elastic.internal:9200"
  publicDefaultPrometheusUrl: "http://thanos-query:9090"
  dbHost: "mysql.internal"

secrets:
  nextopsAdminPass: "REPLACE_ME"
  nextopsDifyToken: "REPLACE_ME"
  dbPassword: "REPLACE_ME"
EOF

helm install nextops ./charts/nextops -f my-values.yaml -n nextops --create-namespace
```

### Chart contents

| Template | Purpose |
|----------|---------|
| `deployment.yaml` | Single-replica Deployment with probes and resource limits |
| `service.yaml` | ClusterIP Service (port 80 → 3000) |
| `ingress.yaml` | Optional Ingress (disabled by default) |
| `configmap.yaml` | Non-secret environment variables |
| `secret.yaml` | Credentials and API keys |
| `serviceaccount.yaml` | Pod service account |

### Operator checklist

1. **Override all `CHANGEME` secret values** in `values.yaml` or via `--set`
2. **Set `config.origin`** when using Ingress (SvelteKit CSRF/origin checks)
3. **Disable proxy buffering** on Ingress for SSE paths (`/api/alerts/stream`, `/api/logs/stream`)
4. **Configure `config.nextopsSitesConfig`** if per-site Prometheus URLs differ from the baked-in JSON
5. **Direct Upstream Access ([ADR-0019](adr/0019-direct-upstream-access-production-deploy.md))** — Production deploy applies both runtime switches off unless that switch is explicitly opted in. Do not enable both by habit. Image-build `HTTP_PROXY` is unrelated.
6. **Verify MySQL connectivity** — pipeline KPIs and timeout drill-down require `jenkins_build_info`
7. Use `existingSecret` to reference an externally managed Secret instead of chart-generated one

### SRE admin settings (post-deploy)

After login, operators configure runtime preferences at `/admin` (redirects to `/admin/sources`):

| Category | Route | Storage | Deploy impact |
|----------|-------|---------|---------------|
| 資料源 | `/admin/sources` | Browser localStorage | Display defaults only; server uses env vars |
| 儀表板 | `/admin/dashboard` | Browser localStorage | Refresh interval, pipeline threshold/window |
| AI Agents | `/admin/ai-agents` | Browser localStorage | Display defaults only |
| PromQL | `/admin/promql` | Browser localStorage | Per-browser query template overrides |
| 上游診斷 | `/admin/diagnosis` | Server in-memory | Shared per pod |

These settings are **not** in Helm values or ConfigMaps. Each operator browser holds its own preferences. For a shared default threshold/window, document the expected SRE admin values in your runbook.

### Upgrade / uninstall

```bash
helm upgrade nextops ./charts/nextops -f my-values.yaml -n nextops
helm uninstall nextops -n nextops
```

## Operational details

### Scaling

NextOps is stateless except for in-memory alert/diagnosis state. Horizontal scaling works behind a load balancer, but:

- SSE connections are long-lived — ensure the LB supports streaming without buffering
- Alert webhook state and diagnosis errors are per-pod (not shared across replicas)

For multi-replica deployments, consider sticky sessions for SSE or accept per-replica alert feeds.

### Port mapping

| Context | Port |
|---------|------|
| Container / adapter-node | 3000 |
| Helm Service | 80 → 3000 |
| Dev server (`npm run dev`) | 5173 |

### Monitoring

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Liveness/readiness probe |
| `GET /api/diagnosis` | Active upstream errors (MySQL, ES, Prometheus) |
| `GET /api/pipeline-metrics` | Pipeline success/timeout KPIs (`?thresholdSec=&windowHours=`) |
| `GET /api/pipeline-timeouts` | Timeout drill-down data (`?thresholdSec=&windowHours=&appName=`) |

Pipeline APIs accept optional query params (defaults: `thresholdSec=300`, `windowHours=24`). The dashboard passes values from SRE admin settings in the operator's browser.

### Build verification

Before pushing a container image:

```bash
npm run check              # TypeScript / Svelte check
npm run test:prometheus    # Prometheus client + proxy unit tests
npm run build              # Production adapter-node build
```

### Resource recommendations

Default Helm limits: 500m CPU, 512Mi memory. Increase if running many concurrent SSE connections.
