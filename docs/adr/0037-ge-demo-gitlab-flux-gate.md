# GE demo gate is GitLab CI plus Flux

The 10/30 security scene uses a sample GitLab project. GitLab CI calls Vertex Gemini for a STRIDE check on the merge request diff. A failing job is not merged. Flux on the GKE cluster pulls only the branch a person merged, with a read-only deploy key, and applies it to `ge-sample`. Flux does not deploy NextOps. The CI bot does not merge.

Cloud Source Repositories was the earlier demo git because it stays inside the GE project. The company already reviews changes on GitLab, and the Application catalog already points at GitLab projects. The demo follows that review habit. `scripts/ge/deploy.sh` still points Flux at Cloud Source Repositories until this slice is implemented. GKE must reach that GitLab host or the scene cannot be recorded.

This does not turn NextOps into a GitLab UI, does not add CI chrome to Application Registration, and does not reuse GitLab Access or GitLab Read Access as the Flux credential.

## Considered Options

| Option | Outcome |
| --- | --- |
| GitLab CI gate, human merge, Flux pull (chosen) | The merge request is the artifact the video shows. A bad revision never becomes a Git commit Flux can read |
| Cloud Build plus Cloud Source Repositories | Stays inside GE, and hides the review on a host the team does not already use for application source |
| Auto-merge when the STRIDE job passes | Removes the human gate the demo uses for high-risk changes |

## Consequences

- The deploy key is a third GitLab credential, beside GitLab Access and GitLab Read Access.
- A `privileged: true` manifest fails the job and stays unmerged.
- A clean manifest still waits for a person to merge before Flux syncs.
