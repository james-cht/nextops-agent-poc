#!/usr/bin/env bash
# Feedback loop: upstream reachability + container env injection (nerdctl).
# Run on the deploy host:  bash scripts/diagnose-upstream.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ENV_FILE="${ENV_FILE:-.env.prod}"
NAME="${CONTAINER_NAME:-nextops-nextops-1}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: missing $ENV_FILE"
  exit 1
fi

PROM=$(awk -F= '$1=="PUBLIC_DEFAULT_PROMETHEUS_URL"{print $2}' "$ENV_FILE" | tr -d '\r')
ES=$(awk -F= '$1=="ES_BASE_URL"{print $2}' "$ENV_FILE" | tr -d '\r')
PROXY_ON=$(awk -F= '$1=="PUBLIC_DEFAULT_PROXY_ENABLED"{print $2}' "$ENV_FILE" | tr -d '\r')

echo "== config =="
echo "PROM=$PROM"
echo "ES=$ES"
echo "PROXY_ENABLED=$PROXY_ON"

echo "== host reachability =="
curl -sS -o /dev/null -w "prom_host=%{http_code} t=%{time_total}\n" --max-time 8 "${PROM%/}/-/ready" || echo "prom_host=FAIL"
curl -sS -o /dev/null -w "es_host=%{http_code} t=%{time_total}\n" --max-time 8 "$ES" || echo "es_host=FAIL"

echo "== container env (selected) =="
# Prefer inspect (does not hang like nerdctl exec on some rootless setups)
if CID=$(timeout 15 nerdctl ps -q --filter "name=${NAME}" 2>/dev/null | head -1); [[ -n "${CID:-}" ]]; then
  timeout 15 nerdctl inspect "$CID" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | awk -F= '/^(ES_BASE_URL|PUBLIC_DEFAULT_PROXY_ENABLED|PUBLIC_DEFAULT_PROMETHEUS_URL)=/{print}' || true
else
  echo "WARN: no running container matching ${NAME}"
fi

echo "== pass criteria =="
echo "- Host Prom/ES should return HTTP (not FAIL)"
echo "- Container ES_BASE_URL must match .env.prod (not empty / not localhost)"
echo "- Proxy profile on shsdgx: ENABLED=true HOST=192.0.2.1:808 + BYPASS_SITE_HOSTS=true (MySQL via proxy, Prom/ES direct)"
echo "- Avoid nerdctl compose ps on this host (hangs / drops SSH)"
