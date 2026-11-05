# nextops Helm Chart

Deploy NextOps to Kubernetes.

## Quick start

```bash
helm install nextops ./charts/nextops \
  --set image.repository=your-registry/nextops \
  --set image.tag=0.1.0 \
  --set secrets.nextopsAdminPass=REPLACE \
  --set secrets.nextopsDifyToken=REPLACE \
  -n nextops --create-namespace
```

## Configuration

| Values key | Env var | Notes |
|------------|---------|-------|
| `config.esBaseUrl` | `ES_BASE_URL` | Elasticsearch URL (server proxy for logs/ES tools) |
| `config.publicDefaultPrometheusUrl` | `PUBLIC_DEFAULT_PROMETHEUS_URL` | Global KPI Prometheus |
| `config.dbHost` | `DB_HOST` | MySQL for pipeline metrics and timeout drill-down |
| `config.robustaDbHost` | `ROBUSTA_DB_HOST` | Robusta Store MySQL (Investigation history; ADR-0028) |
| `config.robustaDbName` | `ROBUSTA_DB_NAME` | Robusta Store MySQL database name (not a table) |
| `config.robustaActionUrl` | `ROBUSTA_ACTION_URL` | Robusta trigger URL for Live Pod Diagnostics (ADR-0030) |
| `config.origin` | `ORIGIN` | Public browser URL. Required behind Ingress (`https://…`); also required for plain HTTP so session cookies are not marked `Secure` |
| `config.nextopsSitesConfig` | `NEXTOPS_SITES_CONFIG` | JSON override for sites |
| `secrets.nextopsAdminPass` | `NEXTOPS_ADMIN_PASS` | Dashboard login |
| `secrets.nextopsDifyToken` | `NEXTOPS_DIFY_TOKEN` | Tool Endpoint Token (leftover name) |
| `secrets.dbPassword` | `DB_PASSWORD` | MySQL credentials |
| `secrets.robustaActionToken` | `ROBUSTA_ACTION_TOKEN` | Robusta Action Token for Live Pod Diagnostics |
| `dailyCheckReport.enabled` | `DAILY_CHECK_BASE_URL` | Sidecar for 運維點檢. Own image `dailyCheckReport.image` |
| `dailyCheckReport.prometheusUrl` | `PROMETHEUS_URL` | Empty uses `config.publicDefaultPrometheusUrl` |
| `secrets.gmailTo` / `secrets.googleChatWebhookUrl` | `GMAIL_TO` / `GOOGLE_CHAT_WEBHOOK_URL` | Delivery secrets. Empty disables send |

See `values.yaml` for all options. **Never deploy with default `CHANGEME` secrets.**

## Post-deploy operator settings

SRE admin preferences (dashboard refresh interval, pipeline timeout threshold, metrics window) are stored in **browser localStorage**, not Helm values. After deploy, operators configure these at `/admin/dashboard`. Document expected values in your runbook if teams need a shared baseline.

## Ingress and SSE

Enable Ingress with proxy buffering disabled for alert and log SSE streams:

```yaml
ingress:
  enabled: true
  annotations:
    nginx.ingress.kubernetes.io/proxy-buffering: "off"
```

## External secrets

To use a pre-created Secret instead of the chart template:

```yaml
existingSecret: nextops-credentials
```

The Secret must contain all keys listed in `templates/secret.yaml`.

Full deployment guide: [docs/deployment.md](../../docs/deployment.md)
