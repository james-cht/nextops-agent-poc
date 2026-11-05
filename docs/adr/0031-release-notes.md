# ADR-0031: Operator-facing Release Notes

## Status

Accepted; implemented through Release `1.3.0`. Glossary: `CONTEXT.md` — Release Notes, Release, Release Version, Release Note, Release Note Summary / Detail, Operational Guidance, Release Notes Last-Read.

## Context

Cluster Operators need to see what changed in a NextOps dashboard ship — short summaries, then detail and operational guidance — without treating git history, Alert Center, Operator Chat, or Documentation Explorer as that product. Image identity is already `BUILD_SHA` ([ADR-0018](0018-shsdgx-image-only-deploy.md)); in-dashboard `/docs` was already rejected ([ADR-0008](0008-documentation-explore-spa.md)). Notes cannot live only in `docs/` on the VM: Image-Only Deploy does not rsync that tree.

## Decision

1. **Release Notes** (更新說明) is a header popover left of 聊天, available to every authenticated Operator Role including Viewer, absent on the login page. Not a slide-over, not a sidebar page, not a Direct URL Route. The icon stays when caught up; tooltip and popover chrome show the running **Release Version**; unread is a **dot**, not a count.

2. **Release Version** is Cluster Operator-facing semver starting at `1.0.0` (the first ship that includes this surface; no backfill of earlier dashboard history). **BUILD_SHA remains the image tag.** A new Release exists only when there is at least one **Release Note**; a rebuild with no Notes keeps the same Version (several BUILD_SHAs may run it). Increment **minor** for a new operator-visible capability, **patch** for a fix/copy/tweak, **major** only when an existing operator path breaks. Not library API semver.

3. **Content ships in the dashboard image**, authored in-repo in Traditional Chinese. A **Release Note** has a plain-text **Summary**, required **Detail**, and optional **Operational Guidance**. Detail and Guidance use constrained markup only (paragraphs, lists, same-origin NextOps path links). Following a same-origin link navigates in this tab and closes the popover. Not a Runtime Setting, not SRE-admin authoring after deploy, not Documentation Explorer, not full markdown / HTML / images / OPSGPT chrome.

4. **Published Releases are frozen.** A later image may only add a new Release Version; it must not delete, rewrite, or append Notes onto an older Version. A copy fix is a new patch Release (the unread dot may light again). The popover lists every Release in this image, newest first; **Release Notes Last-Read** (per Operator Account, Local Settings Store) only drives the dot — it does not hide history.

## Considered Options

| Option | Outcome |
|--------|---------|
| Operator-facing semver + Notes in the image (chosen) | Version and guidance match what the process is running; Image-Only Deploy still works |
| Show BUILD_SHA as the product version | Fingerprint is the image tag, not something a Cluster Operator should learn |
| Semver that always bumps on every ship, or only ever +patch | Either nags on no-op rebuilds, or wastes the semver we chose to issue |
| Platform Owner composes notes in SRE admin | Becomes an ops bulletin; Version can drift from the running code |
| In-dashboard `/docs` or Documentation Explorer as the detail surface | Contradicts ADR-0008; explore is not on the shsdgx operator path |
| Header slide-over or a dedicated page | Second chat-sized panel, or a sidebar item, for a short notice |
| Per-note unread, browser-only seen, or hide the icon when caught up | Nags, lies across devices, or hides “what am I running?” |
| Rewrite old Releases in a later image | Last-Read would miss new Notes stuffed into an already-seen Version |

## Consequences

- Do not display BUILD_SHA as Release Version, add an admin notes editor, or reopen in-dashboard docs for this product.
- First ship of this surface is Release `1.0.0` and should include a Note for Release Notes itself.
- Last-Read belongs in the Local Settings Store with other per–Operator Account prefs; Release Note bodies do not.
- Git tags, if any, should follow Release Version — they are not a second operator-facing number.
