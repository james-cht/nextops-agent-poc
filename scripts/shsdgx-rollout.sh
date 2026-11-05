#!/usr/bin/env bash
# Human-gated shsdgx Image-Only publish / IMAGE_TAG rollback.
# Agent must not publish. After IDP (or any Release) is implemented, the operator
# runs publish. Rollback swaps the previous nextops:<BUILD_SHA> image — it does
# not rewrite Release Version (ADR-0018, ADR-0031, ADR-0032).
#
# From WSL:
#   ./scripts/shsdgx-rollout.sh status
#   ./scripts/shsdgx-rollout.sh publish
#   ./scripts/shsdgx-rollout.sh rollback
#
# Skip the type-to-confirm prompt (still operator-only):
#   YES=1 ./scripts/shsdgx-rollout.sh publish

set -euo pipefail

SSH_HOST="${DEPLOY_SSH_HOST:-shsdgx}"
SSH_USER="${DEPLOY_SSH_USER:-james}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-~/repositories/nextops}"
APP_PORT="${PORT:-3003}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
SSH_OPTS=(-o "User=${SSH_USER}" -o BatchMode=yes)
IMAGE_ROLLOUT_CLI=(node --experimental-strip-types "${REPO_ROOT}/scripts/image-rollout.mts")
CMD="${1:-}"

usage() {
  echo "Usage: $0 status|publish|rollback" >&2
  echo "  status    print current/previous IMAGE_TAG and /api/health (no change)" >&2
  echo "  publish   Image-Only Deploy (you type PUBLISH)" >&2
  echo "  rollback  previous IMAGE_TAG (you type ROLLBACK); not Release Version" >&2
  exit 2
}

require_confirm() {
  local word="$1"
  if [[ "${YES:-}" == "1" ]]; then
    echo "YES=1: skipping '${word}' prompt."
    return 0
  fi
  if [[ ! -t 0 ]]; then
    echo "ERROR: stdin is not a TTY. Type the command yourself, or set YES=1." >&2
    exit 1
  fi
  printf "Type %s to continue: " "$word"
  local got
  read -r got
  if [[ "$got" != "$word" ]]; then
    echo "Aborted."
    exit 1
  fi
}

read_remote_pointer_json() {
  ssh "${SSH_OPTS[@]}" "$SSH_HOST" "bash -lc $(printf '%q' "if [[ -f ${REMOTE_DIR}/.nextops-rollout.json ]]; then cat ${REMOTE_DIR}/.nextops-rollout.json; else echo null; fi")"
}

print_status() {
  echo "Testing SSH to ${SSH_USER}@${SSH_HOST} ..."
  ssh -o ConnectTimeout=20 "${SSH_OPTS[@]}" "$SSH_HOST" "echo ssh_ok"
  local json current previous
  json="$(read_remote_pointer_json)"
  current="$("${IMAGE_ROLLOUT_CLI[@]}" show "$json" | awk -F= '/^current=/{print substr($0,9)}')"
  previous="$("${IMAGE_ROLLOUT_CLI[@]}" show "$json" | awk -F= '/^previous=/{print substr($0,10)}')"
  echo "Rollout pointer (IMAGE_TAG / BUILD_SHA, not Release Version):"
  echo "  current : ${current:-"(none)"}"
  echo "  previous: ${previous:-"(none — rollback will refuse)"}"
  if [[ -n "${previous:-}" ]]; then
    echo "Rollback: $0 rollback  # swaps compose to previous IMAGE_TAG (ADR-0032)"
  fi
  echo "Health:"
  ssh "${SSH_OPTS[@]}" "$SSH_HOST" "bash -lc $(printf '%q' "curl -fsS --max-time 10 http://127.0.0.1:${APP_PORT}/api/health || echo HEALTH_FAIL")"
}

case "$CMD" in
  status)
    print_status
    ;;
  publish)
    print_status
    echo
    echo "This will Image-Only Deploy from this workstation (build tar → shsdgx)."
    echo "You publish. The agent does not. Rollback afterwards: $0 rollback"
    require_confirm "PUBLISH"
    exec "$REPO_ROOT/scripts/deploy-remote.sh"
    ;;
  rollback)
    print_status
    echo
    echo "This swaps compose to the previous IMAGE_TAG."
    echo "頁首更新說明仍顯示那張 image 內建的 Release Version，不是把版本號改回去。"
    require_confirm "ROLLBACK"
    exec "$REPO_ROOT/scripts/rollback-remote.sh"
    ;;
  *)
    usage
    ;;
esac
