#!/usr/bin/env bash
# Create the Google Enterprise project resources for the ge-hackathon demo.
# Does not deploy workloads. Re-running skips resources that already exist.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-asia-east1}"
CLUSTER_NAME="${CLUSTER_NAME:-nextops-ge}"
ARTIFACT_REPO="${ARTIFACT_REPO:-nextops}"
SOURCE_REPO="${SOURCE_REPO:-ge-sample-manifest}"
GSA_ID="${GSA_ID:-nextops-runtime}"
GSA_EMAIL="${GSA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
ROOT="$(cd "$(dirname "$0")" && pwd)"

gcloud config set project "$PROJECT_ID"

gcloud services enable \
	container.googleapis.com \
	artifactregistry.googleapis.com \
	aiplatform.googleapis.com \
	monitoring.googleapis.com \
	cloudbuild.googleapis.com \
	cloudscheduler.googleapis.com \
	sourcerepo.googleapis.com \
	gmail.googleapis.com \
	chat.googleapis.com \
	iam.googleapis.com \
	iamcredentials.googleapis.com

if ! gcloud artifacts repositories describe "$ARTIFACT_REPO" --location="$REGION" >/dev/null 2>&1; then
	gcloud artifacts repositories create "$ARTIFACT_REPO" \
		--repository-format=docker \
		--location="$REGION" \
		--description="NextOps GE hackathon images"
fi

if ! gcloud container clusters describe "$CLUSTER_NAME" --region="$REGION" >/dev/null 2>&1; then
	gcloud container clusters create "$CLUSTER_NAME" \
		--project="$PROJECT_ID" \
		--region="$REGION" \
		--release-channel=regular \
		--machine-type=e2-standard-4 \
		--num-nodes=1 \
		--workload-pool="${PROJECT_ID}.svc.id.goog" \
		--workload-metadata=GKE_METADATA \
		--enable-ip-alias
fi

gcloud container clusters get-credentials "$CLUSTER_NAME" --region="$REGION" --project="$PROJECT_ID"

if ! gcloud iam service-accounts describe "$GSA_EMAIL" >/dev/null 2>&1; then
	gcloud iam service-accounts create "$GSA_ID" --display-name="NextOps GE runtime"
fi

for role in roles/aiplatform.user roles/monitoring.viewer roles/source.reader; do
	gcloud projects add-iam-policy-binding "$PROJECT_ID" \
		--member="serviceAccount:${GSA_EMAIL}" \
		--role="$role" \
		--condition=None
done

gcloud iam service-accounts add-iam-policy-binding "$GSA_EMAIL" \
	--role=roles/iam.workloadIdentityUser \
	--member="serviceAccount:${PROJECT_ID}.svc.id.goog[nextops/nextops]"

kubectl create namespace nextops --dry-run=client -o yaml | kubectl apply -f -
kubectl create serviceaccount nextops -n nextops --dry-run=client -o yaml | kubectl apply -f -
kubectl annotate serviceaccount nextops -n nextops \
	iam.gke.io/gcp-service-account="$GSA_EMAIL" \
	--overwrite

if ! gcloud source repos describe "$SOURCE_REPO" >/dev/null 2>&1; then
	gcloud source repos create "$SOURCE_REPO"
fi

for policy in "$ROOT"/alerts/*.json; do
	curl --fail-with-body -sS -X POST \
		-H "Authorization: Bearer $(gcloud auth print-access-token)" \
		-H "Content-Type: application/json" \
		"https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/alertPolicies" \
		-d @"$policy" || echo "alert policy create returned non-zero for $(basename "$policy"); continue if it already exists"
done

cat <<EOF

Manual steps gcloud cannot finish:

1. Google Chat: in the Cloud console, configure the Chat app for project ${PROJECT_ID}.
   Install it into two spaces (confirmation, then publish) and copy each space webhook URL.
2. Gmail: a Workspace admin must grant domain-wide delegation to ${GSA_EMAIL}.
   Client id: \$(gcloud iam service-accounts describe ${GSA_EMAIL} --format='value(uniqueId)')
   Scope: https://www.googleapis.com/auth/gmail.send
3. After NextOps has a public URL, create the inspection schedules (video uses the button):
   gcloud scheduler jobs create http nextops-inspection-morning \\
     --location=${REGION} --schedule='10 8 * * *' --time-zone=Asia/Taipei \\
     --uri='https://NEXTOPS_HOST/api/inspection/run' --http-method=POST \\
     --oidc-service-account-email=${GSA_EMAIL}
   gcloud scheduler jobs create http nextops-inspection-evening \\
     --location=${REGION} --schedule='10 20 * * *' --time-zone=Asia/Taipei \\
     --uri='https://NEXTOPS_HOST/api/inspection/run' --http-method=POST \\
     --oidc-service-account-email=${GSA_EMAIL}

EOF
