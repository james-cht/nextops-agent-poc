#!/usr/bin/env bash
# Deploy NextOps to shsdgx (remote nerdctl/containerd host). Intended to run from WSL/bash.
#
# Human entry (confirm, then this script): ./scripts/shsdgx-rollout.sh publish
#
# Default (production shsdgx — Image-Only Deploy, ADR-0018):
#   ./scripts/deploy-remote.sh
#   → local nerdctl build + save, scp tar + docker-compose.yml, remote load + compose up, clean source/docs
#
# Development opt-in (sync source, remote build — not for production VM footprint):
#   MODE=Rsync ./scripts/deploy-remote.sh
#   MODE=RemoteBuild ./scripts/deploy-remote.sh
#
# Build env: prefer .env.prod.shsdgx on workstation (PUBLIC_* aligned with shsdgx); never scp'd.
# Runtime env: .env.prod on the VM only.

set -euo pipefail

MODE="${MODE:-ImageTar}"
SSH_HOST="${DEPLOY_SSH_HOST:-shsdgx}"
SSH_USER="${DEPLOY_SSH_USER:-james}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-~/repositories/nextops}"
APP_PORT="${PORT:-3003}"
CLEAN_REMOTE_SOURCE="${CLEAN_REMOTE_SOURCE:-1}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
SSH_OPTS=(-o "User=${SSH_USER}" -o BatchMode=yes)

compute_build_sha() {
  local head dirty fingerprint
  if head="$(git rev-parse HEAD 2>/dev/null)"; then
    dirty="$(git status --porcelain 2>/dev/null || true)"
    fingerprint="$(
      {
        printf '%s\n' "$head"
        printf '%s\n' "$dirty"
        git diff 2>/dev/null || true
        git diff --cached 2>/dev/null || true
      } | sha256sum | awk '{ print substr($1, 1, 12) }'
    )"
    if [[ -n "$dirty" ]]; then
      printf '%s\n' "${fingerprint}"
    else
      git rev-parse --short=12 HEAD 2>/dev/null || printf '%s\n' "$fingerprint"
    fi
    return 0
  fi

  fingerprint="$(
    {
      find src Dockerfile package.json package-lock.json docker-compose.yml \
        -type f 2>/dev/null | sort | xargs sha256sum 2>/dev/null || true
      date -u +%Y%m%d%H%M%S
    } | sha256sum | awk '{ print substr($1, 1, 12) }'
  )"
  printf '%s\n' "$fingerprint"
}

BUILD_SHA="${BUILD_SHA:-$(compute_build_sha)}"
IMAGE_TAG="${IMAGE_TAG:-$BUILD_SHA}"
IMAGE_ROLLOUT_CLI=(node --experimental-strip-types "${REPO_ROOT}/scripts/image-rollout.mts")

remote() {
  echo ">> ssh ${SSH_USER}@${SSH_HOST}: $*"
  ssh "${SSH_OPTS[@]}" "$SSH_HOST" "bash -lc $(printf '%q' "$*")"
}

read_remote_pointer_json() {
  ssh "${SSH_OPTS[@]}" "$SSH_HOST" "bash -lc $(printf '%q' "if [[ -f ${REMOTE_DIR}/.nextops-rollout.json ]]; then cat ${REMOTE_DIR}/.nextops-rollout.json; else echo null; fi")"
}

persist_image_rollout() {
  local current new_json env_text pinned
  echo "Recording image rollout pointer for nextops:${IMAGE_TAG} (keep previous image; do not prune) ..."
  current="$(read_remote_pointer_json)"
  new_json="$("${IMAGE_ROLLOUT_CLI[@]}" record "$current" "$IMAGE_TAG")"
  printf '%s' "$new_json" | ssh "${SSH_OPTS[@]}" "$SSH_HOST" "cat > ${REMOTE_DIR}/.nextops-rollout.json"
  env_text="$(ssh "${SSH_OPTS[@]}" "$SSH_HOST" "cat ${REMOTE_DIR}/.env.prod")"
  pinned="$(printf '%s' "$env_text" | "${IMAGE_ROLLOUT_CLI[@]}" pin-env IMAGE_TAG "$IMAGE_TAG")"
  printf '%s' "$pinned" | ssh "${SSH_OPTS[@]}" "$SSH_HOST" "cat > ${REMOTE_DIR}/.env.prod.tmp && mv ${REMOTE_DIR}/.env.prod.tmp ${REMOTE_DIR}/.env.prod && ln -sfn .env.prod ${REMOTE_DIR}/.env"
  echo "Image rollout pointer: $(printf '%s' "$new_json" | tr -d '\r\n')"
}

resolve_build_env_src() {
  if [[ -n "${BUILD_ENV_FILE:-}" && -f "${REPO_ROOT}/${BUILD_ENV_FILE}" ]]; then
    printf '%s\n' "${BUILD_ENV_FILE}"
    return 0
  fi
  if [[ -f "${REPO_ROOT}/.env.prod.shsdgx" ]]; then
    printf '%s\n' ".env.prod.shsdgx"
    return 0
  fi
  if [[ -f "${REPO_ROOT}/.env.prod" ]]; then
    printf '%s\n' ".env.prod"
    return 0
  fi
  echo "ERROR: no local build env (.env.prod.shsdgx or .env.prod). Create on workstation; do not commit." >&2
  exit 1
}

stage_build_env_prod() {
  local src
  src="$(resolve_build_env_src)"
  echo "Staging ${src} → .env.prod for Dockerfile build (workstation only)"
  cp "${REPO_ROOT}/${src}" "${REPO_ROOT}/.env.prod"
}

read_dotenv_assignment() {
  local file="$1" key="$2" line
  line="$(grep -E "^${key}=" "$file" 2>/dev/null | tail -1 || true)"
  printf '%s' "${line#${key}=}" | tr -d '"' | tr -d "'"
}

resolve_public_base_path() {
  if [[ -n "${PUBLIC_BASE_PATH:-}" ]]; then
    printf '%s' "${PUBLIC_BASE_PATH}"
    return 0
  fi
  local file
  for file in "${REPO_ROOT}/.env.prod" "${REPO_ROOT}/.env.prod.shsdgx"; do
    if [[ -f "$file" ]]; then
      read_dotenv_assignment "$file" PUBLIC_BASE_PATH
      return 0
    fi
  done
}

remote_health_ok() {
  local prefix health_alt
  prefix="$(resolve_public_base_path)"
  prefix="${prefix%/}"
  if [[ -n "$prefix" && "$prefix" != "/" ]]; then
    health_alt="http://127.0.0.1:${APP_PORT}${prefix}/api/health"
  else
    health_alt="http://127.0.0.1:${APP_PORT}/api/health"
  fi
  remote "curl -fsS --max-time 10 http://127.0.0.1:${APP_PORT}/api/health || curl -fsS --max-time 10 ${health_alt}"
}

clean_remote_source() {
  if [[ "${CLEAN_REMOTE_SOURCE}" != "1" ]]; then
    echo "Skipping remote source/docs cleanup (CLEAN_REMOTE_SOURCE=${CLEAN_REMOTE_SOURCE})"
    return 0
  fi
  echo "Removing leftover source/docs on ${SSH_HOST}:${REMOTE_DIR} (image-only boundary) ..."
  remote "
set -euo pipefail
cd ${REMOTE_DIR}
for path in src docs charts ansible scripts mcp-adapter langgraph-orchestrator node_modules .svelte-kit build .git .cursor .claude .gitnexus graphify-out; do
  [[ -e \"\$path\" ]] || continue
  echo \"  rm -rf \$path\"
  rm -rf \"\$path\"
done
for path in README.md docs/agents/workspace-guide.md CONTEXT.md; do
  [[ -e \"\$path\" ]] || continue
  echo \"  rm -f \$path\"
  rm -f \"\$path\"
done
rm -f nextops-*.tar 2>/dev/null || true
echo 'Kept: .env.prod, .env, docker-compose.yml, .nextops-rollout.json, .data'"
}

echo "Testing SSH to ${SSH_USER}@${SSH_HOST} ..."
ssh -o ConnectTimeout=20 "${SSH_OPTS[@]}" "$SSH_HOST" "echo ssh_ok"
REMOTE_WHOAMI="$(ssh "${SSH_OPTS[@]}" "$SSH_HOST" 'whoami' | tr -d '\r')"
if [[ "$REMOTE_WHOAMI" == "root" ]]; then
  echo "ERROR: refusing deploy as root. Use james (DEPLOY_SSH_USER=${SSH_USER})." >&2
  exit 1
fi
if [[ "$REMOTE_WHOAMI" != "$SSH_USER" ]]; then
  echo "ERROR: remote user is '${REMOTE_WHOAMI}', expected '${SSH_USER}'." >&2
  exit 1
fi
echo "Remote account: ${REMOTE_WHOAMI} (ok)"

cd "$REPO_ROOT"

ensure_remote_runtime() {
  remote 'systemctl --user start containerd.service 2>/dev/null || true'
  remote 'systemctl --user start buildkit.service 2>/dev/null || true'
  remote "mkdir -p ${REMOTE_DIR}"
}

rsync_tree() {
  echo "Rsyncing ${REPO_ROOT}/ -> ${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/ (dev mode; preserves remote .env.prod)"
  rsync -az --delete \
    --exclude '.git/' \
    --exclude 'node_modules/' \
    --exclude '.svelte-kit/' \
    --exclude 'build/' \
    --exclude '.env' \
    --exclude '.env.prod' \
    --exclude '.env.prod.shsdgx' \
    --exclude 'docs/agents/.local/' \
    --exclude 'graphify-out/' \
    --exclude 'ansible/' \
    --exclude 'nextops-*.tar' \
    --exclude 'nextops-image.tar' \
    -e "ssh ${SSH_OPTS[*]}" \
    "${REPO_ROOT}/" \
    "${SSH_HOST}:${REMOTE_DIR}/"
}

require_remote_env_prod() {
  echo "Checking remote ${REMOTE_DIR}/.env.prod (runtime secrets — VM only) ..."
  remote "
set -euo pipefail
cd ${REMOTE_DIR}
if [[ ! -f .env.prod ]]; then
  if [[ -f .env ]]; then
    echo 'NOTE: found .env but not .env.prod — copying .env -> .env.prod once'
    cp .env .env.prod
  else
    echo 'ERROR: ${REMOTE_DIR}/.env.prod is missing.' >&2
    echo 'Create it on the server (cp .env.example .env.prod && edit secrets).' >&2
    exit 1
  fi
fi
ln -sfn .env.prod .env
sed -i '/^ORIGIN=$/d' .env.prod || true
set_env_bool() {
  local key="\$1" val="\$2"
  if grep -q "^\${key}=" .env.prod; then
    sed -i "s/^\${key}=.*/\${key}=\${val}/" .env.prod
  else
    printf '\\n%s=%s\\n' "\$key" "\$val" >> .env.prod
  fi
}
set_env_bool PUBLIC_DEFAULT_PROXY_ENABLED false
set_env_bool PUBLIC_MYSQL_PROXY_ENABLED false
echo 'OK: Direct Upstream Access env applied (fetch + MySQL CONNECT off)'
echo 'OK: .env.prod present; .env -> .env.prod for compose interpolation'
"
}

stop_existing_nextops() {
  echo "Checking existing containers and port ${APP_PORT} on ${SSH_HOST} ..."
  remote "
set -euo pipefail
cd ${REMOTE_DIR}
APP_PORT=${APP_PORT}

echo '==> Containers matching nextops (name or image)'
MATCHED=\$(timeout 20 nerdctl ps -a --format '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null | grep -i nextops || true)
if [[ -n \"\$MATCHED\" ]]; then
  echo \"\$MATCHED\"
else
  echo '(none)'
fi

echo \"==> Port \${APP_PORT} listeners\"
if command -v ss >/dev/null 2>&1; then
  ss -ltn \"sport = :\${APP_PORT}\" || true
else
  netstat -ltn 2>/dev/null | grep \":\${APP_PORT}\" || true
fi

echo '==> Stopping compose stack (best-effort, timed)'
timeout 45 nerdctl compose down || echo 'compose down timed out or failed — continuing with nerdctl stop'

echo '==> Stopping leftover nextops containers (name/image/port)'
mapfile -t LEFTOVER < <(
  timeout 20 nerdctl ps -a --format '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Ports}}' 2>/dev/null \
    | awk -v p=\":\${APP_PORT}->\" 'BEGIN{IGNORECASE=1} \$0 ~ /nextops/ || index(\$0, p) { print \$1 }' \
    | sort -u
)
if [[ \${#LEFTOVER[@]} -eq 0 ]]; then
  echo '(no leftover containers)'
else
  for id in \"\${LEFTOVER[@]}\"; do
    [[ -z \"\$id\" ]] && continue
    echo \"Stopping/removing \$id\"
    timeout 30 nerdctl stop \"\$id\" || true
    timeout 30 nerdctl rm -f \"\$id\" || true
  done
fi

echo \"==> Re-check port \${APP_PORT}\"
if command -v ss >/dev/null 2>&1 && ss -ltn \"sport = :\${APP_PORT}\" 2>/dev/null | grep -q LISTEN; then
  echo \"ERROR: port \${APP_PORT} is still occupied after stopping nextops containers.\" >&2
  exit 1
fi
echo \"Port \${APP_PORT} is free — ready to restart\"
"
}

compose_rebuild() {
  ensure_remote_runtime
  require_remote_env_prod
  stop_existing_nextops

  local build_proxy="${HTTP_PROXY:-http://192.0.2.3:3129}"
  local build_no_proxy="${NO_PROXY:-localhost,127.0.0.1,harbor-hep.corp.example.com}"

  echo "Building image nextops:${IMAGE_TAG} on remote (BUILD_SHA=${BUILD_SHA}) ..."
  remote "cd ${REMOTE_DIR} && HTTP_PROXY=${build_proxy} HTTPS_PROXY=${build_proxy} http_proxy=${build_proxy} https_proxy=${build_proxy} NO_PROXY=${build_no_proxy} no_proxy=${build_no_proxy} BUILD_SHA=${BUILD_SHA} IMAGE_TAG=${IMAGE_TAG} nerdctl compose build"

  echo "Starting container on port ${APP_PORT} (tag=${IMAGE_TAG}) ..."
  remote "cd ${REMOTE_DIR} && BUILD_SHA=${BUILD_SHA} IMAGE_TAG=${IMAGE_TAG} PORT=${APP_PORT} nerdctl compose up -d"
  persist_image_rollout
}

case "$MODE" in
  Rsync)
    echo "DEV: rsync source + remote build (tag: ${IMAGE_TAG})"
    remote "mkdir -p ${REMOTE_DIR}"
    rsync_tree
    compose_rebuild
    ;;
  RemoteBuild)
    echo "DEV: remote git pull + build (tag: ${IMAGE_TAG})"
    remote "mkdir -p ${REMOTE_DIR}"
    remote "test -d ${REMOTE_DIR}/.git || git clone https://github.com/james-cht/nextops.git ${REMOTE_DIR}"
    remote "cd ${REMOTE_DIR} && git fetch origin && git checkout master && git pull --ff-only origin master"
    compose_rebuild
    ;;
  ImageTar)
    TAR_PATH="${TAR_PATH:-${REPO_ROOT}/nextops-${IMAGE_TAG}.tar}"
    echo "Image-Only Deploy to shsdgx (tag: ${IMAGE_TAG})"
    if [[ ! -f "$TAR_PATH" ]]; then
      stage_build_env_prod
      build_public_base_path="$(read_dotenv_assignment "${REPO_ROOT}/.env.prod" PUBLIC_BASE_PATH)"
      build_proxy="${HTTP_PROXY:-http://192.0.2.3:3129}"
      build_no_proxy="${NO_PROXY:-localhost,127.0.0.1,harbor-hep.corp.example.com}"
      HTTP_PROXY="${build_proxy}" HTTPS_PROXY="${build_proxy}" \
      http_proxy="${build_proxy}" https_proxy="${build_proxy}" \
      NO_PROXY="${build_no_proxy}" no_proxy="${build_no_proxy}" \
      nerdctl build \
        --build-arg "HTTP_PROXY=${build_proxy}" \
        --build-arg "HTTPS_PROXY=${build_proxy}" \
        --build-arg "NO_PROXY=${build_no_proxy}" \
        --build-arg "BUILD_SHA=${BUILD_SHA}" \
        --build-arg "IMAGE_TAG=${IMAGE_TAG}" \
        --build-arg "PUBLIC_BASE_PATH=${build_public_base_path}" \
        -t "nextops:${IMAGE_TAG}" \
        "$REPO_ROOT"
      nerdctl save -o "$TAR_PATH" "nextops:${IMAGE_TAG}"
    fi
    REMOTE_TAR="/tmp/nextops-${IMAGE_TAG}.tar"
    scp "${SSH_OPTS[@]}" "$TAR_PATH" "${SSH_HOST}:${REMOTE_TAR}"
    scp "${SSH_OPTS[@]}" docker-compose.yml "${SSH_HOST}:${REMOTE_DIR}/"
    remote "nerdctl load -i ${REMOTE_TAR} && rm -f ${REMOTE_TAR}"
    echo "Loaded nextops:${IMAGE_TAG}; previous nextops images on the VM are kept for rollback"
    ensure_remote_runtime
    require_remote_env_prod
    stop_existing_nextops
    remote "cd ${REMOTE_DIR} && BUILD_SHA=${BUILD_SHA} IMAGE_TAG=${IMAGE_TAG} PORT=${APP_PORT} nerdctl compose up -d --no-build"
    persist_image_rollout
    clean_remote_source
    ;;
  *)
    echo "Unknown MODE=${MODE} (use ImageTar, Rsync, or RemoteBuild)" >&2
    exit 1
    ;;
esac

sleep 8
remote "timeout 20 nerdctl ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' | grep -i nextops || true"
if ! remote_health_ok; then
  echo "ERROR: health check failed after deploy of nextops:${IMAGE_TAG}." >&2
  echo "If a previous image is recorded, roll back with: ./scripts/rollback-remote.sh" >&2
  remote "timeout 20 nerdctl logs --tail 40 nextops-nextops-1 2>/dev/null || true"
  exit 1
fi
echo "Deploy complete. Mode=${MODE} BUILD_SHA=${BUILD_SHA} Image tag: ${IMAGE_TAG}"
echo "Production shsdgx: use default ImageTar. Dev iteration: MODE=Rsync or MODE=RemoteBuild."
echo "Rollback previous image (not Release Version): ./scripts/rollback-remote.sh"
