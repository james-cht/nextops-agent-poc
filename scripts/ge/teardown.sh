#!/usr/bin/env bash
# Remove the GE demo resources that accrue charges.
# Leaves the project and its enabled APIs in place.
# Chat app config and Gmail domain-wide delegation are not billing resources and are not removed.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-asia-east1}"
CLUSTER_NAME="${CLUSTER_NAME:-nextops-ge}"
ARTIFACT_REPO="${ARTIFACT_REPO:-nextops}"
SOURCE_REPO="${SOURCE_REPO:-ge-sample-manifest}"
GSA_ID="${GSA_ID:-nextops-runtime}"
GSA_EMAIL="${GSA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"

if [ "${CONFIRM:-}" != "delete" ]; then
	echo "Refusing to delete. Re-run with CONFIRM=delete after verification." >&2
	exit 1
fi

gcloud config set project "$PROJECT_ID"

if gcloud container clusters describe "$CLUSTER_NAME" --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
	gcloud container clusters delete "$CLUSTER_NAME" \
		--region="$REGION" \
		--project="$PROJECT_ID" \
		--quiet
fi

delete_listed_disks() {
	local filter="$1"
	local name zone
	while IFS=$'\t' read -r name zone; do
		[ -n "$name" ] || continue
		zone="${zone##*/}"
		gcloud compute disks delete "$name" --zone="$zone" --project="$PROJECT_ID" --quiet || true
	done < <(gcloud compute disks list \
		--project="$PROJECT_ID" \
		--filter="$filter" \
		--format="value(name,zone)")
}

delete_listed_disks "labels.goog-k8s-cluster-name=${CLUSTER_NAME}"
delete_listed_disks "name~^gke-${CLUSTER_NAME}-"

if gcloud artifacts repositories describe "$ARTIFACT_REPO" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
	gcloud artifacts repositories delete "$ARTIFACT_REPO" \
		--location="$REGION" \
		--project="$PROJECT_ID" \
		--quiet
fi

if gcloud source repos describe "$SOURCE_REPO" --project="$PROJECT_ID" >/dev/null 2>&1; then
	gcloud source repos delete "$SOURCE_REPO" --project="$PROJECT_ID" --quiet
fi

for job in nextops-inspection-morning nextops-inspection-evening; do
	gcloud scheduler jobs delete "$job" --location="$REGION" --project="$PROJECT_ID" --quiet || true
done

token="$(gcloud auth print-access-token)"
policies="$(curl -fsS \
	-H "Authorization: Bearer ${token}" \
	"https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/alertPolicies")"
printf '%s' "$policies" | python3 -c '
import json, sys
data = json.load(sys.stdin)
for policy in data.get("alertPolicies", []):
    if str(policy.get("displayName", "")).startswith("GE inspection"):
        print(policy["name"])
' | while IFS= read -r name; do
	[ -n "$name" ] || continue
	curl -fsS -X DELETE \
		-H "Authorization: Bearer ${token}" \
		"https://monitoring.googleapis.com/v3/${name}" >/dev/null || true
done

for role in roles/aiplatform.user roles/monitoring.viewer roles/source.reader; do
	gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
		--member="serviceAccount:${GSA_EMAIL}" \
		--role="$role" \
		--condition=None \
		--quiet || true
done

if gcloud iam service-accounts describe "$GSA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
	gcloud iam service-accounts delete "$GSA_EMAIL" --project="$PROJECT_ID" --quiet
fi

echo "Deleted demo cluster, disks, Artifact Registry repo, source repo, schedules, GE inspection alerts, and ${GSA_EMAIL}."
echo "The project and its APIs are still there. Chat and Gmail delegation were not removed."
