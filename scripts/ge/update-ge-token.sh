#!/usr/bin/env bash
# 更新 nextops-ge-agents 的 GE_AGENT_ACCESS_TOKEN
set -euo pipefail
cd "$(dirname "$0")"
ENV_FILE=.env.prod
KEY=GE_AGENT_ACCESS_TOKEN
PROXY=http://192.0.2.8:3128
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
export HTTPS_PROXY=$PROXY HTTP_PROXY=$PROXY
gcloud config set proxy/type http >/dev/null 2>&1 || true
gcloud config set proxy/address 192.0.2.8 >/dev/null 2>&1 || true
gcloud config set proxy/port 3128 >/dev/null 2>&1 || true

# 1. 檢查登入
ACCT=$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null || true)
if [ -z "$ACCT" ] || ! gcloud auth print-access-token >/dev/null 2>&1; then
  echo "尚未登入或憑證失效，開始登入（請照畫面開網址、貼回驗證碼）..."
  gcloud auth login --no-launch-browser
  ACCT=$(gcloud auth list --filter=status:ACTIVE --format='value(account)')
fi
echo "目前帳號：$ACCT"

# 2. 產生新 token
TOKEN=$(gcloud auth print-access-token)
[ -n "$TOKEN" ] || { echo "產生 token 失敗"; exit 1; }

# 3. 備份並取代
TS=$(date +%Y%m%d-%H%M%S)
cp "$ENV_FILE" "$ENV_FILE.bak-$TS" && chmod 600 "$ENV_FILE.bak-$TS"
if grep -q "^$KEY=" "$ENV_FILE"; then
  TMP=$(mktemp); chmod 600 "$TMP"
  awk -v k="$KEY" -v v="$TOKEN" 'BEGIN{FS=OFS="="} $1==k{print k"="v; next} {print}' "$ENV_FILE" > "$TMP"
  cat "$TMP" > "$ENV_FILE"; rm -f "$TMP"
else
  printf '%s=%s\n' "$KEY" "$TOKEN" >> "$ENV_FILE"
fi
echo "已更新 $KEY（備份：$ENV_FILE.bak-$TS）"

# 4. 驗證 token 有效
CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 15 \
  "https://oauth2.googleapis.com/tokeninfo?access_token=$TOKEN" || echo 000)
echo "tokeninfo 檢查：HTTP $CODE（200 代表有效）"
unset TOKEN

# 5. 重啟用到 token 的容器（輸出過濾，避免印出密鑰）
nerdctl compose -p nextops-ge-agents up -d --force-recreate nextops langgraph-orchestrator 2>&1 \
  | grep -vE 'Running \[' | tail -n 5
nerdctl compose -p nextops-ge-agents ps
echo "完成。token 約 1 小時後過期，到時再執行一次即可。"
