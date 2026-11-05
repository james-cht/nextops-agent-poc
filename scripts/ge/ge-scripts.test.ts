import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const bootstrap = readFileSync(new URL('./bootstrap.sh', import.meta.url), 'utf8');
const deploy = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');
const triggerOom = readFileSync(new URL('./trigger-oom.sh', import.meta.url), 'utf8');
const teardown = readFileSync(new URL('./teardown.sh', import.meta.url), 'utf8');

const requiredApis = [
	'container.googleapis.com',
	'artifactregistry.googleapis.com',
	'aiplatform.googleapis.com',
	'monitoring.googleapis.com',
	'cloudbuild.googleapis.com',
	'cloudscheduler.googleapis.com',
	'sourcerepo.googleapis.com',
	'gmail.googleapis.com',
	'chat.googleapis.com',
	'iam.googleapis.com'
];

describe('GE bootstrap script', () => {
	it('enables the Google APIs the five demo scenes call', () => {
		for (const api of requiredApis) {
			assert.ok(bootstrap.includes(api), api);
		}
	});

	it('creates a GKE Standard cluster with Workload Identity', () => {
		assert.match(bootstrap, /gcloud container clusters create /);
		assert.match(bootstrap, /--workload-pool="\$\{PROJECT_ID\}\.svc\.id\.goog"/);
		assert.doesNotMatch(bootstrap, /create-auto/);
		assert.doesNotMatch(bootstrap, /--autopilot/);
	});

	it('binds the NextOps Kubernetes service account to the runtime service account', () => {
		assert.match(bootstrap, /roles\/aiplatform\.user/);
		assert.match(bootstrap, /roles\/monitoring\.viewer/);
		assert.match(bootstrap, /roles\/iam\.workloadIdentityUser/);
		assert.match(bootstrap, /\$\{PROJECT_ID\}\.svc\.id\.goog\[nextops\/nextops\]/);
		assert.match(bootstrap, /iam\.gke\.io\/gcp-service-account/);
	});

	it('creates a Docker Artifact Registry repo and the sample Cloud Source Repository', () => {
		assert.match(bootstrap, /artifacts repositories create "\$ARTIFACT_REPO"/);
		assert.match(bootstrap, /--repository-format=docker/);
		assert.match(bootstrap, /source repos create "\$SOURCE_REPO"/);
	});

	it('leaves Chat app install and Gmail domain-wide delegation as manual steps', () => {
		assert.match(bootstrap, /Google Chat/);
		assert.match(bootstrap, /Gmail/);
		assert.match(bootstrap, /domain-wide delegation/);
	});
});

describe('GE deploy script', () => {
	it('refuses to run without an admin password', () => {
		assert.match(deploy, /NEXTOPS_ADMIN_PASS:\?/);
	});

	it('pushes to Artifact Registry and helm-upgrades NextOps with Workload Identity', () => {
		assert.match(deploy, /docker push /);
		assert.match(deploy, /helm upgrade --install nextops /);
		assert.match(deploy, /iam\.gke\.io\/gcp-service-account/);
		assert.match(deploy, /-n nextops/);
	});

	it('installs Robusta, Crane, and Flux without making NextOps the Flux target', () => {
		assert.match(deploy, /helm upgrade --install robusta /);
		assert.match(deploy, /webhook_sink/);
		assert.match(deploy, /helm upgrade --install crane /);
		assert.match(deploy, /https:\/\/gocrane\.github\.io\/helm-charts/);
		assert.match(deploy, /flux install/);
		assert.match(deploy, /--target-namespace=ge-sample/);
		assert.doesNotMatch(deploy, /flux create kustomization[^\n]*nextops\/charts/);
	});

	it('seeds one Crane Recommendation for the video', () => {
		assert.match(deploy, /crane-recommendation\.yaml/);
		const recommendation = readFileSync(new URL('./crane-recommendation.yaml', import.meta.url), 'utf8');
		assert.match(recommendation, /kind: Recommendation/);
		assert.match(recommendation, /cpu: 50m/);
		assert.match(recommendation, /memory: 64Mi/);
	});
});

describe('GE teardown script', () => {
	it('refuses to delete unless CONFIRM=delete', () => {
		assert.match(teardown, /CONFIRM/);
		assert.match(teardown, /delete/);
	});

	it('deletes the billable demo resources and leftover disks', () => {
		assert.match(teardown, /container clusters delete "\$CLUSTER_NAME"/);
		assert.match(teardown, /artifacts repositories delete "\$ARTIFACT_REPO"/);
		assert.match(teardown, /source repos delete "\$SOURCE_REPO"/);
		assert.match(teardown, /iam service-accounts delete "\$GSA_EMAIL"/);
		assert.match(teardown, /compute disks delete/);
		assert.match(teardown, /goog-k8s-cluster-name/);
		assert.match(teardown, /nextops-inspection-morning/);
		assert.match(teardown, /nextops-inspection-evening/);
		assert.match(teardown, /GE inspection/);
	});

	it('does not delete the project or disable its APIs', () => {
		assert.doesNotMatch(teardown, /projects delete/);
		assert.doesNotMatch(teardown, /services disable/);
	});
});

describe('GE OOM trigger', () => {
	it('starts a low-memory pod in the demo namespace only', () => {
		assert.match(triggerOom, /namespace ge-sample/);
		assert.match(triggerOom, /memory: "32Mi"/);
		assert.doesNotMatch(triggerOom, /namespace nextops/);
	});
});
