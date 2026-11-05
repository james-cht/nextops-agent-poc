# NextOps

AI-powered cluster operations dashboard — SvelteKit UI + API integrating Prometheus, Elasticsearch, MySQL (pipeline metrics), and Dify. The 運維點檢 page (`/ops-check`) proxies to the `daily-check-report` FastAPI service.

**Documentation:** [docs/README.md](docs/README.md)

## Quick start

```bash
npm install
cp .env.example .env   # configure upstream URLs and credentials
npm run dev            # http://localhost:5173
```

```bash
nerdctl compose up --build   # containerized, http://localhost:3000
```

```bash
helm install nextops ./charts/nextops -f my-values.yaml
```

## Deployment prerequisites

| Dependency | Required for |
|------------|--------------|
| Prometheus / Thanos | Global KPIs, per-site metrics |
| Elasticsearch | Smart Logging (`/logs`) |
| MySQL (`jenkins_build_info`) | Pipeline KPIs and timeout drill-down |
| Dify | AI Diagnosis (`/ai`) |
| daily-check-report | 運維點檢 (`/ops-check`) — CaaS from `PUBLIC_DEFAULT_PROMETHEUS_URL` |

See [docs/configuration.md](docs/configuration.md) for environment variables and [docs/deployment.md](docs/deployment.md) for Docker, Helm, and operational notes.

Operator preferences (dashboard refresh interval, pipeline timeout threshold, metrics window) are configured in **SRE admin** (`/admin`) and stored in browser localStorage — not deployment env vars.
