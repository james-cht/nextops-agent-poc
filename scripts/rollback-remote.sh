#!/usr/bin/env bash
# Roll the shsdgx compose stack back to the previous IMAGE_TAG (BUILD_SHA).
# This does not change Release Version — the previous image ships its own catalog.
#
# Human entry (confirm, then this script): ./scripts/shsdgx-rollout.sh rollback
#
# From WSL:
#   ./scripts/rollback-remote.sh

set -euo pipefail

SSH_HOST="${DEPLOY_SSH_HOST:-shsdgx}"
SSH_USER="${DEPLOY_SSH_USER:-james}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-~/repositories/nextops}"
APP_PORT="${PORT:-3003}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
SSH_OPTS=(-o "User=${SSH_USER}" -o BatchMode=yes)
IMAGE_ROLLOUT_CLI=(node --experimental-strip-types "${REPO_ROOT}/scripts/image-rollout.mts")

remote() {
  echo ">> ssh ${SSH_USER}@${SSH_HOST}: $*"
  ssh "${SSH_OPTS[@]}" "$SSH_HOST" "bash -lc $(printf '%q' "$*")"
}

pointer_current() {
  "${IMAGE_ROLLOUT_CLI[@]}" current "$1"
}

echo "Testing SSH to ${SSH_USER}@${SSH_HOST} ..."
ssh -o ConnectTimeout=20 "${SSH_OPTS[@]}" "$SSH_HOST" "echo ssh_ok"

CURRENT_JSON="$(ssh "${SSH_OPTS[@]}" "$SSH_HOST" "bash -lc $(printf '%q' "if [[ -f ${REMOTE_DIR}/.nextops-rollout.json ]]; then cat ${REMOTE_DIR}/.nextops-rollout.json; else echo null; fi")")"
NEXT_JSON="$("${IMAGE_ROLLOUT_CLI[@]}" rollback "$CURRENT_JSON")"
PREV_TAG="$(pointer_current "$NEXT_JSON")"
if [[ -z "$PREV_TAG" ]]; then
  echo "ERROR: rollback pointer did not yield an IMAGE_TAG." >&2
  exit 1
fi

echo "Rolling compose back to nextops:${PREV_TAG} (IMAGE_TAG, not Release Version) ..."

if ! remote "nerdctl image inspect nextops:${PREV_TAG} >/dev/null"; then
  LOCAL_TAR="${REPO_ROOT}/nextops-${PREV_TAG}.tar"
  if [[ -f "$LOCAL_TAR" ]]; then
    echo "Previous image missing on VM; loading ${LOCAL_TAR}"
    REMOTE_TAR="/tmp/nextops-${PREV_TAG}.tar"
    scp "${SSH_OPTS[@]}" "$LOCAL_TAR" "${SSH_HOST}:${REMOTE_TAR}"
    remote "nerdctl load -i ${REMOTE_TAR} && rm -f ${REMOTE_TAR}"
  else
    echo "ERROR: nextops:${PREV_TAG} is not on the VM and ${LOCAL_TAR} is not on this workstation." >&2
    echo "Load that image tar, then retry. Do not prune previous nextops images after deploy." >&2
    exit 1
  fi
fi

ENV_TEXT="$(ssh "${SSH_OPTS[@]}" "$SSH_HOST" "cat ${REMOTE_DIR}/.env.prod")"
PINNED="$(printf '%s' "$ENV_TEXT" | "${IMAGE_ROLLOUT_CLI[@]}" pin-env IMAGE_TAG "$PREV_TAG")"
printf '%s' "$PINNED" | ssh "${SSH_OPTS[@]}" "$SSH_HOST" "cat > ${REMOTE_DIR}/.env.prod.tmp && mv ${REMOTE_DIR}/.env.prod.tmp ${REMOTE_DIR}/.env.prod && ln -sfn .env.prod ${REMOTE_DIR}/.env"
printf '%s' "$NEXT_JSON" | ssh "${SSH_OPTS[@]}" "$SSH_HOST" "cat > ${REMOTE_DIR}/.nextops-rollout.json"

remote "cd ${REMOTE_DIR} && BUILD_SHA=${PREV_TAG} IMAGE_TAG=${PREV_TAG} PORT=${APP_PORT} nerdctl compose up -d --no-build"

sleep 8
remote "timeout 20 nerdctl ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' | grep -i nextops || true"
if ! remote "curl -fsS --max-time 10 http://127.0.0.1:${APP_PORT}/api/health"; then
  echo "ERROR: health check failed after rollback to nextops:${PREV_TAG}." >&2
  remote "timeout 20 nerdctl logs --tail 40 nextops-nextops-1 2>/dev/null || true"
  exit 1
fi
echo "Rollback complete. Running image tag: ${PREV_TAG}"
echo "A later deploy or a second rollback can return to the image that was just replaced."
