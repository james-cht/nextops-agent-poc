#!/usr/bin/env bash
set -euo pipefail
URL="${DIFY_BASE_URL%/}/chat-messages"
OUT=/tmp/dify-diag.out
CODE=$(curl -sS -o "$OUT" -w '%{http_code}' --connect-timeout 15 \
  -X POST "$URL" \
  -H "Authorization: Bearer ${DIFY_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{"inputs":{"site_id":"AMATA"},"query":"ping","response_mode":"blocking","conversation_id":"","user":"nextops-diagnose"}')
echo "http=$CODE"
echo -n 'body_prefix='
head -c 200 "$OUT" || true
echo
if [[ "$CODE" =~ ^2 ]]; then
  echo '[B] PASS'
  exit 0
fi
echo '[B] FAIL'
exit 1
