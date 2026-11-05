# ADR-0032: Keep previous image so shsdgx can roll back

## Status

Accepted. Glossary: `CONTEXT.md` — Image-Only Deploy, Release Version. Builds on [ADR-0018](0018-shsdgx-image-only-deploy.md). Release Version numbering stays [ADR-0031](0031-release-notes.md).

## Context

Image-Only Deploy tags the running process as `nextops:<BUILD_SHA>`. After a bad ship, SRE must return to the **previous image** without rebuilding. `nerdctl load` of a new tar does not by itself keep a pointer to the last good tag; pruning old images, or treating **Release Version** as the deploy pin, would make rollback impossible or would lie about which catalog the process is running.

This ADR does **not** apply to Kubernetes (Helm) or generic registry deploys — those use their own rollout objects.

## Decision

1. **Pointer on the VM.** After compose (or `nerdctl run`) has switched to a new `IMAGE_TAG`, write `~/repositories/nextops/.nextops-rollout.json` with `{ current, previous }`. Same tag twice is a no-op. Image-only cleanup must keep this file.
2. **Keep the previous image.** Do not `nerdctl rmi` the previous `nextops:<tag>` after a successful deploy. Disk vs rollback: reclaim images only by explicit SRE action, never as a post-deploy default.
3. **Pin compose.** Write `IMAGE_TAG=<current>` into the VM `.env.prod` so restart without a deploy stays on that tag.
4. **Rollback is IMAGE_TAG.** `scripts/rollback-remote.sh` swaps current/previous, `compose up -d --no-build` with the previous tag, and rewrites the pointer so a later deploy (or a second rollback) can move forward again. It does **not** edit Release Notes or invent a second operator-facing version. The rolled-back image still shows the Release Version baked into that image.
5. **Missing previous image fails closed.** If the previous tag is not on the VM, try the workstation tar `nextops-<tag>.tar`; otherwise refuse rather than rebuild.

## Considered Options

| Option | Outcome |
|--------|---------|
| Keep previous image + VM pointer (chosen) | One-step rollback; Image-Only Deploy still transfers no source |
| Prune all but the running tag | Saves disk; makes rollback require a rebuild or a leftover tar |
| Pin compose to `latest` | Loses which BUILD_SHA is running |
| Treat Release Version as the rollback key | Several BUILD_SHAs may share one Version; rollback would be ambiguous |

## Consequences

- Workstation deploy (`scripts/deploy-remote.sh`) and Ansible image-tar both record the pointer after start, before health, so a failed health check can still roll back.
- Cluster Operators see Release Version in 更新說明; SRE rolls back images. Do not display BUILD_SHA as Release Version to “undo” a Release.
- Helm/registry paths are unchanged.

## References

- [Deployment Guide](../deployment.md#roll-back-the-previous-image)
- [ADR-0018](0018-shsdgx-image-only-deploy.md)
- [ADR-0031](0031-release-notes.md)
