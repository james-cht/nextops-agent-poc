#!/usr/bin/env bash
# Compare host (npm run dev) vs container (nerdctl) metrics path on shsdgx.
# Usage: bash scripts/diagnose-dev-vs-compose.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ENVF="${ENV_FILE:-.env.prod}"
[[ -f "$ENVF" ]] || ENVF=".env"

echo "== mode detection =="
HOST_PORT=""
for p in 3000 3003 5173; do
  if ss -ltn 2>/dev/null | grep -q ":${p} "; then
    echo "listen:${p}"
    HOST_PORT="${HOST_PORT:-$p}"
  fi
done
[[ -n "$HOST_PORT" ]] || HOST_PORT=3000

echo "probe_port=${HOST_PORT}"
CID="$(timeout 15 nerdctl ps -q --filter name=nextops 2>/dev/null | sed -n '1p' || true)"
echo "container_id=${CID:-none}"

echo "== .env.prod (selected, redacted) =="
if [[ -f "$ENVF" ]]; then
  awk -F= '
    $1 ~ /^(PUBLIC_DEFAULT_PROXY_|PUBLIC_MYSQL_PROXY_|DB_HOST|DB_PORT|DB_NAME|PUBLIC_DEFAULT_PROMETHEUS_URL|ES_BASE_URL|PORT)=/ {print}
    $1=="DB_USER"{print "DB_USER_set="(length($2)>0?"yes":"no")}
    $1=="DB_PASSWORD"{print "DB_PASSWORD_set="(length($2)>0?"yes":"no")}
  ' "$ENVF" | tr -d '\r'
else
  echo "FAIL: missing $ENVF"
fi

PROM=$(awk -F= '$1=="PUBLIC_DEFAULT_PROMETHEUS_URL"{print $2}' "$ENVF" 2>/dev/null | tr -d '\r')
DBH=$(awk -F= '$1=="DB_HOST"{print $2}' "$ENVF" 2>/dev/null | tr -d '\r')
DBP=$(awk -F= '$1=="DB_PORT"{print $2}' "$ENVF" 2>/dev/null | tr -d '\r')
PROXY_HOST=$(awk -F= '$1=="PUBLIC_DEFAULT_PROXY_HOST"{print $2}' "$ENVF" 2>/dev/null | tr -d '\r')
PROXY_PORT=$(awk -F= '$1=="PUBLIC_DEFAULT_PROXY_PORT"{print $2}' "$ENVF" 2>/dev/null | tr -d '\r')

echo "== host reachability (npm run dev network) =="
if [[ -n "$PROM" ]]; then
  curl -sS -o /dev/null -w "prom_host=%{http_code} t=%{time_total}\n" --max-time 8 "${PROM%/}/-/ready" || echo "prom_host=FAIL"
fi
if [[ -n "$DBH" && -n "$DBP" ]]; then
  timeout 5 bash -c "echo >/dev/tcp/${DBH}/${DBP}" && echo "db_host_tcp=ok ${DBH}:${DBP}" || echo "db_host_tcp=FAIL ${DBH}:${DBP}"
fi

echo "== container env (if running) =="
if [[ -n "${CID:-}" ]]; then
  timeout 20 nerdctl inspect "$CID" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | awk -F= '/^(PUBLIC_DEFAULT_PROXY_|PUBLIC_MYSQL_PROXY_|DB_HOST|DB_PORT|DB_NAME|PUBLIC_DEFAULT_PROMETHEUS_URL|ES_BASE_URL|PORT|NODE_ENV)=/{print}' \
    || echo "WARN: inspect failed"
  echo "== container reachability (same targets) =="
  timeout 25 nerdctl exec "$CID" sh -c "
    curl -sS -o /dev/null -w 'prom_ctr=%{http_code}\n' --max-time 8 '${PROM%/}/-/ready' || echo prom_ctr=FAIL
    (timeout 5 sh -c 'echo >/dev/tcp/${DBH}/${DBP}' && echo db_ctr_tcp=ok) || echo db_ctr_tcp=FAIL
  " 2>/dev/null || echo "WARN: nerdctl exec failed/timeout"
else
  echo "(no container — start with nerdctl compose up -d to compare)"
fi

echo "== API health on :${HOST_PORT} =="
curl -sS -m 8 -w "health=%{http_code}\n" "http://127.0.0.1:${HOST_PORT}/api/health" || echo "health=FAIL"

echo "== pass criteria =="
echo "- Host npm: prom_host + db_host_tcp should OK when metrics work"
echo "- Container: same targets should OK; if host OK and container FAIL -> network/namespace"
echo "- Container env DB_* / PUBLIC_* must be non-empty (nerdctl ignores env_file)"
echo "- PUBLIC_MYSQL_PROXY_ENABLED should be false unless CONNECT proxy works from container"
echo "- Compare baked PUBLIC_* (image build) vs runtime environment: block"
