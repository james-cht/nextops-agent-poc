#!/usr/bin/env bash
set -euo pipefail

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
REMOTE_DIR="${HOME}/repositories/nextops"
IMAGE_TAG="${IMAGE_TAG:-appearance-theme}"

echo "==> Ensuring rootless containerd + buildkit"
systemctl --user start containerd.service || true
systemctl --user start buildkit.service || true

for i in $(seq 1 30); do
  if [[ -S "${XDG_RUNTIME_DIR}/buildkit/buildkitd.sock" ]] && [[ -d "${XDG_RUNTIME_DIR}/containerd-rootless" ]]; then
    echo "buildkit_ready after ${i}s"
    break
  fi
  echo "waiting for buildkit (${i}/30)..."
  sleep 1
done

if [[ ! -S "${XDG_RUNTIME_DIR}/buildkit/buildkitd.sock" ]]; then
  echo "BuildKit socket missing. Status:" >&2
  systemctl --user status buildkit.service --no-pager || true
  exit 1
fi

export BUILDKIT_HOST="unix://${XDG_RUNTIME_DIR}/buildkit/buildkitd.sock"
export IMAGE_TAG

cd "${REMOTE_DIR}"
echo "==> compose down"
nerdctl compose down || true
echo "==> compose build (IMAGE_TAG=${IMAGE_TAG})"
nerdctl compose build
echo "==> compose up -d"
nerdctl compose up -d
sleep 15
echo "==> health"
curl -fsS http://127.0.0.1:3000/api/health
echo
echo "==> ps"
nerdctl compose ps
echo "Deploy complete."
