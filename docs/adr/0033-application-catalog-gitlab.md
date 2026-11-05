# ADR-0033: Application catalog points at GitLab; NextOps does not clone GitLab

Accepted; Application Catalog + GitLab Registration (ADR-0033) slices through Unregistration are in. Glossary: `CONTEXT.md` — Application, Application Catalog, Application Registration, Application Unregistration, Application Store, GitLab, GitLab Project, GitLab Access, GitLab Read Access, GitLab OAuth Client. Does not rewrite [ADR-0006](0006-pipeline-outcome-taxonomy.md), [ADR-0011](0011-runtime-dify-credentials.md), [ADR-0012](0012-local-settings-store.md), [ADR-0019](0019-direct-upstream-access-production-deploy.md), or [ADR-0027](0027-operator-accounts.md). GitLab follows existing Direct Upstream Access ([ADR-0019](0019-direct-upstream-access-production-deploy.md)). GitLab OAuth Client and GitLab Read Access follow Runtime Setting step-up, probe, mask, and Config Audit Log ([ADR-0011](0011-runtime-dify-credentials.md)).

NextOps needs a durable catalog of software products whose source lives on company GitLab, so later runtime-planning forms can read those GitLab Projects. It must not become a GitLab UI, must not reuse Pipeline (`jenkins_build_info.app_name`), and must not give NextOps a long-lived GitLab write identity. Cluster Operators already authenticate as Operator Accounts ([ADR-0027](0027-operator-accounts.md)); company SSO is still not the NextOps login.

1. **Application** is a NextOps catalog identity: unique immutable Application name, unique GitLab Project path, true 1:1. The name need not equal the GitLab slug. It is not a Pipeline, not a Site, and not Live Pod Diagnostics 應用.
2. **Application Catalog** (應用目錄) is primary-sidebar, fleet-wide. **Application Registration** is the action on that surface (one page; 簡化／進階 is a field toggle, not two routes). **Application Unregistration** deletes the Application Store row and does not delete the GitLab Project; name and path may be registered again. This phase does not strip GitLab Read Access membership on GitLab. Operator and Platform Owner may register and unregister; Viewer may read name and path and must not register or unregister. Create writes exactly one first commit from a zip or folder via **GitLab Access**. Attach leaves GitLab history intact. No Web IDE and no second push in this phase.
3. **GitLab Access** is the operator’s OAuth delegation (via **GitLab OAuth Client**), stored with the Operator Account in the Local Settings Store. It is not a Session. Writes and the proof-to-attach use it. **GitLab Read Access** is NextOps’s one fleet read-only credential, a Runtime Setting. Registration must grant that identity read on the GitLab Project or fail — no Application NextOps cannot read. **GitLab OAuth Client** (base URL, client id, secret) is a Runtime Setting; the OAuth redirect URI is not — it follows the NextOps public URL.
4. **Application Store** is a sidecar SQLite for Applications. Break-glass wipe of the Local Settings Store does not delete the catalog. GitLab Access and GitLab Read Access are not this store.

Runtime-planning forms that emit deploy pipeline config, a Developer persona or Operator Role, GitLab Issues／MR／CI chrome, and treating `docs/prototypes/` IDP screens as this phase are out of scope.

## Considered Options

| Option | Outcome |
|--------|---------|
| NextOps Application 1:1 GitLab Project; operator OAuth writes; platform read-only Runtime Setting; Application Store sidecar (chosen) | Catalog survives account re-seed; NextOps never owns GitLab write; later forms have a stable read path |
| GitLab Project is the NextOps identity | No NextOps name; uniqueness and later forms hang on forge paths |
| Reuse Pipeline `app_name` | New apps without Jenkins rows cannot register; glossary already separates repo granularity as `project_path` |
| PAT or GitLab password for GitLab Access | Not the asked login-and-keep flow; NextOps must not hold GitLab passwords |
| NextOps service account with write, or only operator tokens for later reads | Contradicts platform read-only, or catalog dies when that operator leaves |
| Applications in the Local Settings Store | Break-glass account re-seed wipes the catalog while GitLab Projects remain |
| Mini GitLab client / second push / Web IDE this phase | Second product; rejected as the first slice |
| New Developer Operator Role | Cluster Operator already covers the registrar; Viewer stays read-only on the catalog |
| Disable Application and keep name reserved | Blocks re-registering the same `billing` after a wrong GitLab Project |
| Delete the GitLab Project on unregister | NextOps would destroy source; rejected |

## Consequences

- Do not patch ADR-0012’s contents list for GitLab Access, or ADR-0019’s upstream inventory for GitLab — this ADR is the extension.
- Do not merge GitLab OAuth Client and GitLab Read Access into one “GitLab Connection” identity.
- Unregister is catalog-only: do not delete the GitLab Project, and do not strip GitLab Read Access membership in this phase.
