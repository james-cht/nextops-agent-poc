#!/usr/bin/env bash
# Regression loop: include_tasks must load stop.yml without shell arg splitter error.
# Exit 0 = stop.yml loads (shell may still fail later if nerdctl missing — that is OK).
# Exit 1 = splitter / jinja load error (the deploy bug).
set -u
export PATH="${HOME}/.local/bin:/home/linuxbrew/.linuxbrew/bin:${PATH}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export ANSIBLE_CONFIG="${ANSIBLE_CONFIG:-$ROOT/ansible.cfg}"
PLAY="$ROOT/.diagnose-stop-load.yml"
trap 'rm -f "$PLAY"' EXIT

cat >"$PLAY" <<EOF
---
- name: Regression — stop.yml must load under include_tasks
  hosts: localhost
  connection: local
  gather_facts: false
  vars:
    nextops_remote_dir: /tmp
    nextops_app_port: 3003
    nextops_container_name: nextops
  tasks:
    - name: Include role defaults for nerdctl format vars
      ansible.builtin.include_vars: ${ROOT}/roles/nextops_deploy/defaults/main.yml
    - name: Include stop.yml
      ansible.builtin.include_tasks: ${ROOT}/roles/nextops_deploy/tasks/stop.yml
EOF

echo "[loop] include stop.yml"
set +e
out=$(ansible-playbook "$PLAY" 2>&1)
rc=$?
set -e
echo "$out" | tail -40

if echo "$out" | grep -q 'splitting arguments'; then
  echo "[loop] FAIL: splitter/jinja load error still present"
  exit 1
fi

if echo "$out" | grep -q 'Error loading tasks'; then
  echo "[loop] FAIL: Error loading tasks"
  exit 1
fi

echo "[loop] OK: stop.yml loaded (play rc=$rc; nerdctl runtime errors ignored)"
exit 0
