# IDP real-env wiring checklist

Wire Application Online to real GitLab, KubeSphere, and Jenkins Runtime Check without putting secrets in Git.

## Deploy env (not Runtime Settings)

| Variable | Purpose |
|----------|---------|
| Central GitLab machine-account token | Open Spec MR only (no `main` push/merge) |
| Central pipeline project path | e.g. `dgroup_devops/cicd/jenkins-deployment-pipeline` |
| KubeSphere API URL + credentials | Create/update pipeline jobs (bind template + credential ids) |
| `IDP_CALLBACK_TOKEN` | Jenkins POSTs Runtime Check to `/api/online/runtime-check` |

Do **not** reuse Tool Endpoint Token, GitLab bot token for callbacks, or Local Settings Store for these.

## Smoke path

1. Operator creates Project + membership; Developer saves Spec + artifacts; submit opens MR.
2. Human merges MR; NextOps records published SHA and creates **Dev** job only.
3. 在 Dev 驗證 at pin; Jenkins apply-green; optional Runtime Check callback (failure must not rewrite apply success).
4. Operator records Environment Binding for QA+later when Resource Requests are filled; Config Check clears.
5. Operator releases next hop; `SOURCE_IMAGE` / pin SHA come from previous hop (see Promotion Path).
6. Path end: `prod-promote` once, then per-Site `prod-<site>` kubectl jobs sharing digest.

## Fake ports in tests

CI uses in-process fakes for GitLab / KubeSphere / Jenkins. Swap adapters at the same ports used by `application-online-actions` — do not call Weihai kubectl from NextOps.
