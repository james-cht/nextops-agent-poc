# Local Development

## Upstream connectivity required

NextOps does **not** embed fallback metrics or alerts. Without reachable upstreams, the dashboard shows red-bordered error states on KPI cards and site cards, and Alert Center remains empty until webhooks arrive.

| What you see | Why |
|--------------|-----|
| Red-bordered KPI cards | `/api/prometheus/global-metrics` or `/api/pipeline-metrics` failed |
| Red-bordered site cards | Per-site overview returned HTTP 502 (Prometheus unreachable) |
| Empty Alert Center | No Alertmanager webhooks received yet (expected before webhook setup) |
| Site list error panel | `/api/sites` failed entirely |

**To work with real data locally:** point `.env` at reachable upstream URLs (see [configuration.md](configuration.md)) and verify error states clear after refresh.

## Node.js workflow (recommended for active development)

```bash
npm install
cp .env.example .env
npm run dev
```

- Dev server: `http://localhost:5173` (Vite hot reload)
- Type check: `npm run check`
- Tests: `npm run test:prometheus`, `npm run test:ops-check`, `npm run test:ui`
- Daily check service tests: `pip install -r daily-check-report/requirements.txt && npm run test:daily-check-report`

For `/ops-check` against a local API, run the Python service and point NextOps at it:

```bash
cd daily-check-report
export PROMETHEUS_URL="$PUBLIC_DEFAULT_PROMETHEUS_URL"   # same URL the dashboard uses
export DAILY_CHECK_OUT_DIR=./out
uvicorn daily_check_report.service:app --port 3300
```

In the NextOps `.env`, `DAILY_CHECK_BASE_URL=http://127.0.0.1:3300`. Compose sets that to `http://daily-check-report:3300` and sets the service `PROMETHEUS_URL` from `PUBLIC_DEFAULT_PROMETHEUS_URL`.

Edit `.env` to point at reachable Prometheus, Elasticsearch, and MySQL endpoints on your network. Use the proxy settings if your environment requires HTTP CONNECT to reach internal services.

## Containerized workflow (nerdctl + containerd)

This project targets environments using **nerdctl** with **containerd** rather than Docker Desktop. The `docker-compose.yml` uses standard Compose spec features compatible with both `nerdctl compose` and `docker compose`.

### Prerequisites

- [nerdctl](https://github.com/containerd/nerdctl) installed and configured for your containerd socket
- CNI networking configured (nerdctl default bridge)
- `.env` file from `.env.example`

### Run

```bash
cp .env.example .env
# Edit .env — set upstream URLs reachable from inside the container

nerdctl compose up --build
```

App available at `http://localhost:3000` (or `${PORT}` from `.env`).

### Stop and rebuild

```bash
nerdctl compose down
nerdctl compose up --build    # rebuild after code changes
```

### nerdctl / containerd compatibility notes

| Topic | Guidance |
|-------|----------|
| Compose command | Use `nerdctl compose` (not legacy docker-compose v1) |
| Build context | Standard `build: context: .` — nerdctl builds via BuildKit/containerd |
| Health checks | Uses Node `fetch` inside the container (no `curl`/`wget` dependency) |
| Volume mounts | Not used by default; rebuild image for code changes |
| Platform | No `platform: linux/amd64` pin — builds for host architecture |
| Networking | Container reaches upstream URLs via host network routes; verify connectivity from inside the container |

### What is not included

The compose file runs **only NextOps**. It does not bundle Prometheus, Elasticsearch, MySQL, or Dify — configure real endpoints in `.env`. This matches production architecture where NextOps is a thin integration layer over existing infrastructure.

Without upstreams, the dashboard shows error states on affected surfaces — configure `.env` with reachable endpoints before expecting live data.

## Production-like local test

To verify the production build locally without containers:

```bash
npm run build
node build
```

Uses the same upstream requirements as `npm run dev`.
