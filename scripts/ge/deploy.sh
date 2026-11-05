#!/usr/bin/env bash
# Build NextOps, push it to Artifact Registry, and install the demo stack.
# Flux watches ge-sample-manifest, not this NextOps chart.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-asia-east1}"
CLUSTER_NAME="${CLUSTER_NAME:-nextops-ge}"
ARTIFACT_REPO="${ARTIFACT_REPO:-nextops}"
SOURCE_REPO="${SOURCE_REPO:-ge-sample-manifest}"
IMAGE_TAG="${IMAGE_TAG:-ge-hackathon}"
GSA_ID="${GSA_ID:-nextops-runtime}"
GSA_EMAIL="${GSA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
: "${NEXTOPS_ADMIN_PASS:?Set NEXTOPS_ADMIN_PASS}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/nextops:${IMAGE_TAG}"

gcloud container clusters get-credentials "$CLUSTER_NAME" --region="$REGION" --project="$PROJECT_ID"
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

docker build -t "$IMAGE" "$ROOT"
docker push "$IMAGE"

cat >"${TMPDIR:-/tmp}/nextops-ge-values.yaml" <<EOF
image:
  repository: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/nextops
  tag: ${IMAGE_TAG}
serviceAccount:
  name: nextops
  annotations:
    iam.gke.io/gcp-service-account: ${GSA_EMAIL}
secrets:
  nextopsAdminPass: ${NEXTOPS_ADMIN_PASS}
config:
  origin: ${NEXTOPS_ORIGIN:-}
EOF

helm upgrade --install nextops "$ROOT/charts/nextops" \
	-n nextops \
	--create-namespace \
	-f "${TMPDIR:-/tmp}/nextops-ge-values.yaml"

cat >"${TMPDIR:-/tmp}/robusta-ge-values.yaml" <<'EOF'
clusterName: nextops-ge
sinksConfig:
- webhook_sink:
    name: nextops
    url: http://nextops.nextops.svc.cluster.local/api/ge/robusta-webhook
    format: json
EOF

helm repo add robusta https://robusta-charts.storage.googleapis.com
helm repo update robusta
helm upgrade --install robusta robusta/robusta \
	-n robusta \
	--create-namespace \
	-f "${TMPDIR:-/tmp}/robusta-ge-values.yaml"

helm repo add crane https://gocrane.github.io/helm-charts
helm repo update crane
helm upgrade --install crane crane/crane \
	-n crane-system \
	--create-namespace

kubectl create namespace ge-sample --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f "$ROOT/scripts/ge/crane-recommendation.yaml"
kubectl apply -f "$ROOT/scripts/ge/sample-manifest.yaml"

if ! command -v flux >/dev/null 2>&1; then
	echo "Install the flux CLI, then re-run this script." >&2
	exit 1
fi

flux install --namespace=flux-system
flux create source git ge-sample \
	--namespace=flux-system \
	--url="https://source.developers.google.com/p/${PROJECT_ID}/r/${SOURCE_REPO}" \
	--branch=master \
	--username=oauth2accesstoken \
	--password="$(gcloud auth print-access-token)" \
	--interval=1m || true
flux create kustomization ge-sample \
	--namespace=flux-system \
	--source=ge-sample \
	--path=./ \
	--prune=true \
	--interval=1m \
	--target-namespace=ge-sample
