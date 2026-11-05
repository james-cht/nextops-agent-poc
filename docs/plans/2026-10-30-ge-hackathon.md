# NextOps GE Hackathon

Settled 2026-09-29. Demoable system and demo video due 2026-10-30. All work from that decision lives on branch `ge-hackathon`.

Implementation plan, diagrams, and the Google replacements: [2026-10-30-ge-implementation-plan.md](2026-10-30-ge-implementation-plan.md). Vertex transport: [ADR-0036](../adr/0036-ge-hackathon-vertex-transport.md).

## Outcome

Run the demo on Google Enterprise, on one GKE Standard cluster. The video contains five scenes, in this order: inspection report, Robusta suggestion, STRIDE gate, Crane recommendation, Flux deploy.

## Story

Before: Alertmanager to a Python job, Selenium screenshot, email, Power Automate, Teams. A Warning waits on a person to type a note in Excel before the official group can see it. Alerts and logs stay apart, so nothing writes a root cause or a next action.

After, in the 10/30 video: NextOps builds the inspection card and Vertex Gemini writes the Warning note (root cause and what to do). Google Chat Card v2 and Gmail HTML both appear in that same take. The card links back to the NextOps report. Selenium, the screenshot, Excel, and Power Automate are gone.

Chat and Gmail are both on camera. Warning goes to the confirmation space first. After 確認發布, Gmail sends the HTML report and Chat posts the same card to the publish space. An all-OK run sends the Chat card and the Gmail message together.

The report's 廠區 column still names 龍華、煙台、重慶、北美. SaaS numbers are the reproducible fixture. Live status is Cloud Monitoring on this GKE cluster. The Crane line on the card is the seeded Recommendation for this cluster. Robusta turns a container restart on this cluster into a Gemini runbook and does not restart the pod.

## Inspection report

NextOps draws the six-column report itself: 廠區, 層級, 點檢項目, 點檢人, 狀態, 備註.

The page keeps a replaceable report source. This demo uses the in-process source. A later slice can embed the external Report API HTML (`platform-monitor/create` on `unified-xops`) without rewriting the page. This demo does not call that API. Selenium, screenshot mail, and Base64 images are not on the path.

SaaS rows (龍華／FSJ) are fake and reproducible:

- One call returns all OK.
- One call forces the Kettle／Spark 調度 row to Warning when the failure rate is at least 2%.
- Other rates and error counts still change on every call.

CaaS rows read Google Cloud Monitoring alerts for this GKE cluster. Map labels onto 存儲, 中間件, and K8s 容器. A firing alert is Warning and the note lists the alert name. No firing alert is OK and the note says the firing count is 0. Factory `check_alerts` is not a source for this table.

## Delivery

Both receivers are in the demo. Google Chat sends Card v2 with a link to the live NextOps report. Gmail sends the same report as HTML. There is no Google Meet step and no image post.

- Warning: Chat message goes to the confirmation space first. After a person clicks 確認發布, Gmail sends and Chat posts to the publish space.
- All OK: Chat publish space and Gmail send together.

08:10 and 20:10 remain the schedule names. Cloud Scheduler calls the same NextOps endpoint the on-screen button calls. The video uses the button.

## Five scenes

1. **Inspection.** Refresh once for all-OK SaaS numbers, once for the Kettle Warning. CaaS shows a real Cloud Monitoring alert prepared on this cluster. Complete the Chat confirm click and the Gmail send.
2. **Robusta.** An OOM in a demo namespace. NextOps shows the Gemini remediation text and the command. The video does not restart the pod.
3. **Gate.** GitLab CI runs the STRIDE check on an independent sample project. A `privileged: true` merge request fails. A person does not merge it, so Flux does not see that revision. See [the DevSecOps plan](2026-10-30-ge-devsecops-plan.md).
4. **Crane.** Crane is installed with Helm. One Recommendation is written ahead of time so the video shows concrete requests and limits. The new cluster is not required to have computed that recommendation from history.
5. **Flux.** A passing revision of that same sample manifest is synced by Flux onto this GKE cluster. The target is not NextOps itself.

## Cluster layout

| Piece | Where it runs | Scene |
| --- | --- | --- |
| NextOps | Helm on GKE Standard, image in Artifact Registry, Vertex via Workload Identity | 1, 2 |
| Cloud Monitoring alerts | This GKE cluster | 1 |
| Gemini | Vertex AI `generateContent` in the same GE project, via Workload Identity | 1, 2, 3 |
| Google Chat, Gmail | Workspace APIs | 1 |
| Robusta | Helm on this cluster, demo namespace only | 2 |
| Cloud Build | GE project, STRIDE job | 3 |
| Crane | Helm on this cluster, plus one seeded Recommendation | 4 |
| Flux | This cluster, watching the sample manifest repo | 5 |

Robusta and Crane see this GKE cluster only. They do not inspect factory Kettle, Ceph, or other sites.

## Environment scripts

Run from a machine that already has `gcloud` and `kubectl`. Cloud Shell is enough for bootstrap. Deploy also needs `docker`, `helm`, and `flux`.

```bash
export PROJECT_ID=your-ge-project
bash scripts/ge/bootstrap.sh
export NEXTOPS_ADMIN_PASS='choose-a-demo-password'
bash scripts/ge/deploy.sh
bash scripts/ge/trigger-oom.sh   # Robusta scene only
```

On Windows, `scripts/ge/bootstrap.ps1` calls the same bootstrap script through bash.

Bootstrap enables the APIs, creates the Standard cluster, Artifact Registry, the runtime service account, Workload Identity, the sample Cloud Source Repository, and three Cloud Monitoring policies labeled `inspection=k8s|storage|middleware`. Chat app install, Gmail domain-wide delegation, and the two Cloud Scheduler jobs stay manual; the script prints those commands.

Deploy pushes the current NextOps image and installs NextOps, Robusta, Crane, and Flux. Flux syncs `ge-sample` only.

## Code still to change

These scripts do not add the demo behavior. The application changes, in order:

1. Inspection report at `/inspection`, drawn by NextOps. A report-source seam stays in place for a later Report API embed. SaaS rows come from a reproducible fixture (`ok` or `kettle-warning`, other rates still change). CaaS rows list Cloud Monitoring policies whose `userLabels.inspection` is `storage`, `middleware`, or `k8s`.
2. Delivery. `POST /api/inspection/run` builds the report. Warning posts to the confirmation Chat webhook and waits for `POST /api/inspection/confirm`. That confirm sends Gmail and posts to the publish space. All-OK sends both immediately. The Warning note, Robusta suggestion, STRIDE check, and Diagnosis Orchestrator all call Vertex AI Gemini. The existing AiBridge call site gains a transport switch. GE Helm values set `GEMINI_TRANSPORT=vertex`. The browser still talks only to NextOps. The factory `employee_id` multipart contract stays in the code for a non-vertex deploy.
3. `POST /api/ge/robusta-webhook` stores the latest Robusta payload and shows the Gemini suggestion. It does not call the Robusta action API.
4. A Crane panel reads the seeded Recommendation in `ge-sample`.
5. A sample GitLab project holds the clean and `privileged: true` manifests and the STRIDE CI job. Flux watches that project after a human merge. Flux never points at `charts/nextops`. `scripts/ge/deploy.sh` still points Flux at Cloud Source Repositories until that slice is implemented.

Helm already creates the `nextops` service account. The deploy values file sets the Workload Identity annotation. No change to the factory deploy scripts.

## Schedule

| Dates | Exit |
| --- | --- |
| 09-29 – 09-30 | Branch `ge-hackathon`. GKE Standard, Artifact Registry, Vertex, Workload Identity, Chat space, and Gmail sending are reachable from the cluster. |
| 10-01 – 10-06 | NextOps on GKE shows the six-column report. SaaS OK and Warning calls both work. |
| 10-07 – 10-12 | CaaS reads Cloud Monitoring. Warning path posts to Chat, then Gmail after 確認發布. |
| 10-13 – 10-17 | Robusta OOM suggestion appears in NextOps. No restart. |
| 10-18 – 10-21 | Crane shows the seeded Recommendation. Cloud Build rejects the privileged manifest. |
| 10-22 – 10-24 | Flux syncs a passing sample manifest to the demo namespace. |
| 10-25 – 10-28 | Rehearse and record all five scenes on GE. 10-28 is retakes only. |
| 10-29 – 10-30 | Edit and submit the video. No feature changes. |
