#!/usr/bin/env bash
# Deploy NextOps to shsdgx (default: image-only — local build, scp tar, no source sync).
# See ansible/README.md and docs/adr/0018-shsdgx-image-only-deploy.md
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
export PATH="${HOME}/.local/bin:/home/linuxbrew/.linuxbrew/bin:${PATH}"
export ANSIBLE_CONFIG="${ANSIBLE_CONFIG:-$ROOT/ansible.cfg}"
exec ansible-playbook playbooks/deploy.yml "$@"
