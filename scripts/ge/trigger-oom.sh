#!/usr/bin/env bash
# Start a pod that exceeds its memory limit. Run this during the Robusta scene.
set -euo pipefail

kubectl apply --namespace ge-sample -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: ge-oom-demo
  namespace: ge-sample
spec:
  restartPolicy: Always
  containers:
    - name: oom
      image: busybox:1.36
      command: ["sh", "-c", "x=$(seq 1 10000000); sleep 3600"]
      resources:
        requests:
          memory: "32Mi"
        limits:
          memory: "32Mi"
EOF
