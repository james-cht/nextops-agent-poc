#!/usr/bin/env bash
# add-nextops-opt.sh：列出頂層群組，並（可選）把 nextops-opt 加為 Reporter
set -euo pipefail
GL="https://gitlab-hep.corp.example.com/api/v4"
USER_NAME="nextops-opt"
APPLY="${1:-}"
: "${GITLAB_TOKEN:?請先 export GITLAB_TOKEN=<james 的 token>}"
H=(-sS --noproxy gitlab-hep.corp.example.com -H "PRIVATE-TOKEN: $GITLAB_TOKEN")

uid=$(curl "${H[@]}" "$GL/users?username=$USER_NAME" | jq -r '.[0].id')
[ "$uid" = "null" ] && { echo "找不到 $USER_NAME"; exit 1; }
echo "$USER_NAME id=$uid"

page=1
printf "%-8s %-40s %s\n" ID 群組 目前權限
while :; do
  groups=$(curl "${H[@]}" "$GL/groups?top_level_only=true&all_available=true&per_page=100&page=$page")
  [ "$(echo "$groups" | jq length)" -eq 0 ] && break
  for row in $(echo "$groups" | jq -r '.[] | "\(.id)|\(.full_path)"'); do
    gid=${row%%|*}; path=${row#*|}
    lvl=$(curl "${H[@]}" "$GL/groups/$gid/members/all/$uid" | jq -r '.access_level // "無"')
    printf "%-8s %-40s %s\n" "$gid" "$path" "$lvl"
    if [ "$APPLY" = "--apply" ] && [ "$lvl" = "無" ]; then
      curl "${H[@]}" -X POST "$GL/groups/$gid/members" \
        --data "user_id=$uid&access_level=20" | jq -r '"  → 已加入 Reporter: \(.username // .message)"'
    fi
  done
  page=$((page+1))
done
