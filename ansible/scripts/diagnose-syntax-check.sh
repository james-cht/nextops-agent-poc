#!/usr/bin/env bash
# Verify bare ansible-playbook syntax-check works without ANSIBLE_CONFIG
# (WSL /mnt/c world-writable case).
set -u
export PATH="${HOME}/.local/bin:${PATH}"
cd "$(dirname "$0")/.."
unset ANSIBLE_CONFIG
echo "[loop] cwd=$PWD ANSIBLE_CONFIG=<unset>"
set +e
ansible-playbook playbooks/deploy.yml --syntax-check
rc=$?
set -e
echo "[loop] exit=$rc"
exit "$rc"
