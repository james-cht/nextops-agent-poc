#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="${HOME}/.local/bin:/home/linuxbrew/.linuxbrew/bin:${PATH}"
export ANSIBLE_CONFIG="${ROOT}/ansible.cfg"
exec ansible shsdgx -i inventory/hosts.yml -m script -a "scripts/diagnose-logs-remote.sh"
