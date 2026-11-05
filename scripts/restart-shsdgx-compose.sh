#!/usr/bin/env bash
# Restart NextOps on shsdgx after .env.prod changes (compose only, no image rebuild).
#
# Run from WSL on the operator workstation:
#   ./scripts/restart-shsdgx-compose.sh
#
# Applies updated runtime env via:
#   nerdctl compose up -d --no-build --force-recreate
#
# Does NOT build, save, load, or rsync. For new image deploys use deploy-remote.sh or ansible deploy.sh.

set -euo pipefail

SSH_HOST="${DEPLOY_SSH_HOST:-shsdgx}"
SSH_USER="${DEPLOY_SSH_USER:-james}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-~/repositories/nextops}"
APP_PORT="${PORT:-3003}"
MCP_PORT="${MCP_PORT:-3100}"
ORCH_PORT="${ORCH_PORT:-3200}"
HEALTH_RETRIES="${HEALTH_RETRIES:-12}"
HEALTH_DELAY_SEC="${HEALTH_DELAY_SEC:-5}"
SSH_OPTS=(-o "User=${SSH_USER}" -o BatchMode=yes)

remote() {
  echo ">> ssh ${SSH_USER}@${SSH_HOST}: $*"
  ssh "${SSH_OPTS[@]}" "$SSH_HOST" "bash -lc $(printf '%q' "$*")"
}

echo "Testing SSH to ${SSH_USER}@${SSH_HOST} ..."
ssh -o ConnectTimeout=20 "${SSH_OPTS[@]}" "$SSH_HOST" "echo ssh_ok"

remote "
set -euo pipefail
cd ${REMOTE_DIR}

if [[ ! -f .env.prod ]]; then
  echo 'ERROR: .env.prod is missing. Create it on shsdgx before restart.' >&2
  echo '  cd ${REMOTE_DIR} && cp .env.example .env.prod && edit secrets' >&2
  exit 1
fi

ln -sfn .env.prod .env
sed -i '/^ORIGIN=\$/d' .env.prod || true

read_env_port() {
  local key=\"\$1\"
  local fallback=\"\$2\"
  local val
  val=\$(grep -E \"^\${key}=\" .env.prod 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\"' || true)
  if [[ -n \"\${val}\" ]]; then
    printf '%s\n' \"\${val}\"
  else
    printf '%s\n' \"\${fallback}\"
  fi
}

PORT=\$(read_env_port PORT ${APP_PORT})
MCP_PORT=\$(read_env_port MCP_PORT ${MCP_PORT})
ORCH_PORT=\$(read_env_port ORCH_PORT ${ORCH_PORT})

resolve_image_tag() {
  local tag img
  tag=\$(grep -E '^IMAGE_TAG=' .env.prod 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\"' || true)
  if [[ -n \"\${tag}\" ]]; then
    printf '%s\n' \"\${tag}\"
    return 0
  fi
  while IFS= read -r img; do
    [[ -z \"\${img}\" ]] && continue
    if [[ \"\${img}\" == *nextops:* ]]; then
      printf '%s\n' \"\${img##*nextops:}\"
      return 0
    fi
  done < <(timeout 20 nerdctl ps -a --format '{{.Image}}' 2>/dev/null || true)
  tag=\$(timeout 20 nerdctl images nextops --format '{{.Tag}}' 2>/dev/null | grep -Ev '^<none>\$' | head -1 || true)
  if [[ -n \"\${tag}\" ]]; then
    printf '%s\n' \"\${tag}\"
    return 0
  fi
  return 1
}

if ! IMAGE_TAG=\$(resolve_image_tag); then
  echo 'ERROR: cannot resolve IMAGE_TAG.' >&2
  echo '  Set IMAGE_TAG=<tag> in .env.prod, or load an image (nerdctl load) / run deploy-remote.sh first.' >&2
  echo '  Available: nerdctl images nextops' >&2
  timeout 20 nerdctl images nextops 2>/dev/null || true
  exit 1
fi
echo \"Using IMAGE_TAG=\${IMAGE_TAG}\"

echo \"Recreating compose stack (IMAGE_TAG=\${IMAGE_TAG}, PORT=\${PORT}) — no rebuild\"
BUILD_SHA=\"\${IMAGE_TAG}\" IMAGE_TAG=\"\${IMAGE_TAG}\" PORT=\"\${PORT}\" MCP_PORT=\"\${MCP_PORT}\" ORCH_PORT=\"\${ORCH_PORT}\" \
  nerdctl compose up -d --no-build --force-recreate

wait_for_url() {
  local url=\"\$1\"
  local label=\"\$2\"
  local i
  for ((i = 1; i <= ${HEALTH_RETRIES}; i++)); do
    if curl -fsS --max-time 10 \"\${url}\" >/dev/null; then
      echo \"OK: \${label} (\${url})\"
      return 0
    fi
    echo \"Waiting for \${label} (\${i}/${HEALTH_RETRIES}) ...\"
    sleep ${HEALTH_DELAY_SEC}
  done
  echo \"ERROR: \${label} failed health check: \${url}\" >&2
  echo 'Check logs: nerdctl compose logs --tail 80' >&2
  return 1
}

wait_for_url \"http://127.0.0.1:\${PORT}/api/health\" \"NextOps app\"
wait_for_url \"http://127.0.0.1:\${MCP_PORT}/health\" \"MCP adapter\"
wait_for_url \"http://127.0.0.1:\${ORCH_PORT}/health\" \"LangGraph orchestrator\"

timeout 20 nerdctl ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' | grep -iE 'nextops|mcp|orchestrator|langgraph' || true
echo 'Restart complete. Runtime env reloaded from .env.prod (no image rebuild).'
"
