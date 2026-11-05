#!/usr/bin/env bash
# Feedback loop: Smart Logging on deploy host — env, ES reachability, stream/query probes.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
ENVF="${HOME}/repositories/nextops/.env.prod"
BASE="http://127.0.0.1:3003"

echo "====ENV (redacted)===="
if [[ -f "$ENVF" ]]; then
  grep -E '^(ES_BASE_URL|LOG_INDEX|LOG_INDEX_PREFIX|PUBLIC_DEFAULT_PROXY_|PUBLIC_DEFAULT_ELASTICSEARCH_|PUBLIC_MYSQL_PROXY_)' "$ENVF" \
    | sed -E 's/(PASSWORD|PASS|KEY|TOKEN)=.*/\1=<redacted>/' || true
else
  echo "missing $ENVF"
fi

echo "====HEALTH===="
curl -sS -o /tmp/h -w "http=%{http_code}\n" "$BASE/api/health" || true
cat /tmp/h; echo

echo "====SITES===="
# unauthenticated may 303 — try with cookie jar after login if needed
curl -sS -o /tmp/sites -w "http=%{http_code}\n" -c /tmp/cj -b /tmp/cj "$BASE/api/sites" || true
python3 - <<'PY' || head -c 800 /tmp/sites
import json
from pathlib import Path
raw = Path("/tmp/sites").read_text(encoding="utf-8", errors="replace")
try:
    d = json.loads(raw)
except Exception as e:
    print("non-json", raw[:300])
    raise SystemExit(0)
if isinstance(d, list):
    for s in d[:8]:
        print(s.get("siteId"), "code=", s.get("factoryCode"), "log=", s.get("loggingAvailable"), "mode=", s.get("defaultLogMode"))
else:
    print(raw[:400])
PY

echo "====LOGIN===="
# credentials from env file (username/password only for probe; not printed)
USER=$(grep -E '^NEXTOPS_ADMIN_USER=' "$ENVF" | cut -d= -f2- | tr -d '\r')
PASS=$(grep -E '^NEXTOPS_ADMIN_PASS=' "$ENVF" | cut -d= -f2- | tr -d '\r')
curl -sS -o /tmp/login -w "http=%{http_code}\n" -c /tmp/cj -b /tmp/cj \
  -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${USER}\",\"password\":\"${PASS}\"}" || true
# do not print login body (may leak)

echo "====SITES_AUTH===="
curl -sS -o /tmp/sites2 -w "http=%{http_code}\n" -c /tmp/cj -b /tmp/cj "$BASE/api/sites" || true
python3 - <<'PY'
import json
from pathlib import Path
raw = Path("/tmp/sites2").read_text(encoding="utf-8", errors="replace")
try:
    d = json.loads(raw)
except Exception:
    print(raw[:400]); raise SystemExit(0)
if isinstance(d, list):
    for s in d:
        print(s.get("siteId"), "code=", s.get("factoryCode"), "log=", s.get("loggingAvailable"))
    Path("/tmp/first_site").write_text(d[0]["siteId"] if d else "", encoding="utf-8")
else:
    print(raw[:400]); Path("/tmp/first_site").write_text("", encoding="utf-8")
PY

SITE=$(cat /tmp/first_site 2>/dev/null || true)
echo "first_site=$SITE"

echo "====DESCRIBE===="
if [[ -n "$SITE" ]]; then
  ENC=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$SITE'''))")
  curl -sS -o /tmp/desc -w "http=%{http_code}\n" -c /tmp/cj -b /tmp/cj "$BASE/api/sites/${ENC}/describe" || true
  python3 - <<'PY'
import json
from pathlib import Path
d=json.loads(Path("/tmp/desc").read_text(encoding="utf-8", errors="replace"))
print("factoryCode", d.get("factoryCode"), "defaultLogMode", d.get("defaultLogMode"))
for i in d.get("esIndices") or []:
    print("es", i.get("pattern"), "|", (i.get("description") or "")[:80])
PY
fi

echo "====ES_DIRECT===="
ES=$(grep -E '^ES_BASE_URL=' "$ENVF" | cut -d= -f2- | tr -d '\r')
ES_USER=$(grep -E '^PUBLIC_DEFAULT_ELASTICSEARCH_USER=' "$ENVF" | cut -d= -f2- | tr -d '\r')
ES_PASS=$(grep -E '^PUBLIC_DEFAULT_ELASTICSEARCH_PASSWORD=' "$ENVF" | cut -d= -f2- | tr -d '\r')
echo "ES_BASE_URL host probe (no secrets)"
python3 - <<PY
from urllib.parse import urlparse
u=urlparse("$ES")
print("scheme", u.scheme, "host", u.hostname, "port", u.port)
PY
# cat indices matching logs-* (names only)
if [[ -n "$ES_USER" && -n "$ES_PASS" ]]; then
  curl -sS -o /tmp/es_cat -w "http=%{http_code}\n" -u "${ES_USER}:${ES_PASS}" \
    "${ES}/_cat/indices/logs-*?h=index,docs.count,store.size&s=index:desc" --max-time 15 || true
else
  curl -sS -o /tmp/es_cat -w "http=%{http_code}\n" \
    "${ES}/_cat/indices/logs-*?h=index,docs.count,store.size&s=index:desc" --max-time 15 || true
fi
echo "--- indices (first 30 lines) ---"
head -n 30 /tmp/es_cat 2>/dev/null || true

echo "====ES_QUERY_VIA_APP===="
if [[ -n "$SITE" ]]; then
  curl -sS -o /tmp/esq -w "http=%{http_code}\n" -c /tmp/cj -b /tmp/cj \
    -X POST "$BASE/api/es/query" \
    -H 'Content-Type: application/json' \
    -d "{\"siteId\":\"${SITE}\",\"mode\":\"k8s\",\"query\":\"*\",\"size\":5}" --max-time 30 || true
  python3 - <<'PY'
import json
from pathlib import Path
raw=Path("/tmp/esq").read_text(encoding="utf-8", errors="replace")
try:
    d=json.loads(raw)
except Exception:
    print(raw[:500]); raise SystemExit(0)
if "error" in d:
    print("error", d.get("code"), d.get("error"))
else:
    print("index", d.get("index"), "total", d.get("total"), "hits", len(d.get("hits") or []))
    if d.get("hits"):
        src=(d["hits"][0].get("_source") or {})
        print("sample_keys", list(src.keys())[:12])
PY
fi

echo "====STREAM_SNAPSHOT===="
if [[ -n "$SITE" ]]; then
  # read first SSE events for a few seconds
  timeout 8 curl -sS -N -c /tmp/cj -b /tmp/cj \
    "$BASE/api/logs/stream?siteId=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$SITE'''))")&mode=k8s&interval=3&keyword=*&timeFrom=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -v-1H +%Y-%m-%dT%H:%M:%S.000Z)" \
    | head -c 4000 || true
  echo
fi

echo "====CONTAINER_LOGS===="
CID=$(nerdctl ps -aq --filter name=nextops | head -1 || true)
if [[ -n "$CID" ]]; then
  nerdctl logs --tail 80 "$CID" 2>&1 | grep -E 'proxy_init|Elasticsearch|ES |fetch failed|LOG_INDEX|factory|INVALID|stream' | tail -40 || true
fi
