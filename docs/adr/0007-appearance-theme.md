# Appearance Theme (Dark / Light / System)

Cluster Operators need a selectable visual mode across the entire NextOps UI (including login). We ship **Dark**, **Light**, and **System** (live-follow `prefers-color-scheme`) as a per-browser preference, defaulting to Dark; High-contrast is deferred.

Light is intentionally **neutral** (not a lightened blue-slate kinship of Dark), while Dark keeps the existing cool blue-slate ops personality — two moods, one constant brand accent. Status colors use theme-adapted semantic tokens so Upstream Error State and health signals stay readable. Font-family is out of scope (font-size stays on the renamed admin **顯示** page). The header and admin 顯示 page expose the control; login applies the stored preference but does not offer a switch. Light/System are not exposed in the UI until shell, operator routes, charts, and login chrome are tokenized in one ship.
