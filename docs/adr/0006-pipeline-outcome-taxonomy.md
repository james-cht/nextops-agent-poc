# ADR-0006: Pipeline Outcome Taxonomy — Timeout Drill-down

**Status:** Accepted  
**Date:** 2026-07-01  
**Context:** Global Matrix Dashboard shows Pipeline Metrics KPIs from MySQL `jenkins_build_info`. Operators need to drill down from the timeout rate card to identify which pipelines (`app_name`) are slow and inspect individual Build Records. Success, timeout, aborted, and failure are distinct analysis categories — not interchangeable.  
**Glossary:** `CONTEXT.md` — Pipeline Metrics, Pipeline Timeout, Pipeline Aborted, Pipeline Failure, Build Record, Pipeline, Cluster Operator Build, Pipeline Timeout Threshold, Pipeline Metrics Window, Pipeline Timeout Drill-down, Direct URL Route

## Decision

1. **Taxonomy:** Pipeline **Timeout** is duration-based (`build_duration > threshold`). **Aborted** and **Failure** are status-based (`build_status`) — separate KPIs and drill-downs in a future phase. A build may be `SUCCESS` in Jenkins and still count as a Pipeline Timeout.
2. **v1 scope:** Timeout drill-down only — clickable timeout KPI, route `/pipelines/timeouts`, API `GET /api/pipeline-timeouts`.
3. **Configuration:** Timeout threshold and metrics window are SRE admin settings (儀表板, client/localStorage) passed to APIs as query params. Window is also adjustable on the drill-down page (URL only); threshold is read-only on that page.
4. **Grouping:** Two-level drill-down — L1 by `app_name` (Pipeline), L2 Build Record list for one Pipeline.
5. **Exclusions:** Cluster Operator Builds (`build_user IN ('mc00146','mc00255','admin','null')`) are excluded via a shared server constant used by all pipeline metric queries.

### Why Not

- **Timeout = `build_status`:** Jenkins may not emit a dedicated timeout status; duration is the operational signal for slow pipelines. Status-based timeout would miss long-but-successful builds.
- **Single “failed builds” bucket:** Operators analyze timeout (capacity/SLA), aborted (cancelled runs), and failure (broken builds) for different reasons — merging them obscures root cause.
- **Modal / inline drill-down on `/`:** Two-level tables with many columns need a dedicated page; Alert Center already established Direct URL Route + query-param drill-down.
- **404 on empty drill-down:** Zero timeouts in the window is a valid operator outcome; return 200 with empty arrays.
- **Threshold override on drill-down page:** Would desync the KPI card from the list unless persisted; v1 keeps threshold in SRE admin only.

## Data Source

MySQL table `jenkins_build_info` (database from `DB_NAME`, typically `jenkins`).

| Column | Type | Role |
|--------|------|------|
| `id` | int | Primary key |
| `app_name` | varchar(255) | **Pipeline** identity; L1 group key |
| `name_space` | varchar(255) | Namespace; shown on L1 |
| `manager_email` | varchar(255) | Owner; L2 |
| `gitlab_url` | varchar(255) | Link; L2 |
| `security_ticket_num` | varchar(50) | Ticket ref; L2 |
| `project_path` | varchar(255) | GitLab path; L2 |
| `group_id` | int | Metadata |
| `project_id` | int | Metadata |
| `build_number` | int | Build id within pipeline; L2 |
| `build_user` | varchar(50) | Trigger user; exclusion filter |
| `build_status` | varchar(15) | Outcome (`SUCCESS`, etc.); success KPI + future aborted/failure |
| `build_duration` | decimal(11,0) | Seconds; timeout rule |
| `build_time` | datetime | Window filter |

**Build Record identity:** `app_name` + `build_number` (disambiguate with `build_time` if needed).

## Outcome Rules

| Category | Rule | v1 KPI | v1 Drill-down |
|----------|------|--------|---------------|
| **Success** | `build_status = 'SUCCESS'` | ✅ Global Matrix Dashboard | — |
| **Pipeline Timeout** | `build_duration > thresholdSec` | ✅ Global Matrix Dashboard | ✅ `/pipelines/timeouts` |
| **Pipeline Aborted** | `build_status` TBD (phase 2) | — | `/pipelines/aborted` (future) |
| **Pipeline Failure** | `build_status` TBD (phase 2) | — | `/pipelines/failures` (future) |

**Shared base filter** (all pipeline metric queries):

```sql
WHERE build_user NOT IN ('mc00146', 'mc00255', 'admin', 'null')
  AND build_time >= NOW() - INTERVAL :windowHours HOUR
```

Implement as `PIPELINE_EXCLUDED_BUILD_USERS` (or equivalent) in `src/lib/server/pipeline-filters.ts` — single source for KPI and drill-down.

## SRE Admin Configuration

Category: **儀表板** (`/admin/dashboard`), `effect: 'client'`, storage key `nextops-config` (localStorage).

| Key | Default | Allowed values | Used by |
|-----|---------|----------------|---------|
| `pipeline_timeout_sec` | `300` | Preset select (e.g. 180 / 300 / 600 / 900) | Dashboard KPI poll, drill-down (read-only banner) |
| `pipeline_metrics_window_hours` | `24` | `24`, `48`, `168` | Dashboard KPI poll, drill-down default |

Dashboard and drill-down entry must pass the same `thresholdSec` and `windowHours` to APIs so KPI and lists reconcile.

## API: `GET /api/pipeline-metrics` (extend existing)

**Auth:** Session cookie (same as today).

### Query parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `thresholdSec` | number | `300` | Pipeline Timeout Threshold (seconds) |
| `windowHours` | number | `24` | Pipeline Metrics Window; must be 24, 48, or 168 |

### Response (200)

```typescript
{
  successRate: number;   // percentage, 2 decimal places
  timeoutRate: number;   // percentage, 2 decimal places
  thresholdSec: number;  // echo applied threshold
  windowHours: number;   // echo applied window
}
```

### Errors

| Condition | Status | Code |
|-----------|--------|------|
| MySQL unreachable | 500 | `UPSTREAM_ERROR` |
| No rows in window (after exclusions) | 404 | `NOT_FOUND` (unchanged for KPI) |

**Implementation note:** Replace hardcoded `300` and `INTERVAL 1 DAY` with parameterized threshold and window.

## API: `GET /api/pipeline-timeouts` (new)

**Auth:** Session cookie.

### Query parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `thresholdSec` | number | `300` | Pipeline Timeout Threshold |
| `windowHours` | number | `24` | 24, 48, or 168 |
| `appName` | string | — | If set, return L2 build list for this Pipeline |

### Response L1 — no `appName` (200)

```typescript
{
  thresholdSec: number;
  windowHours: number;
  pipelines: Array<{
    appName: string;
    nameSpace: string | null;
    timeoutCount: number;
    totalBuilds: number;
    timeoutRate: number;      // percentage
    lastTimeoutAt: string | null;  // ISO8601, max build_time among timeout builds
  }>;
}
```

Sorted by `timeoutCount` descending.

**SQL shape (conceptual):**

```sql
SELECT
  app_name,
  name_space,
  SUM(CASE WHEN build_duration > :thresholdSec THEN 1 ELSE 0 END) AS timeout_count,
  COUNT(*) AS total_builds,
  MAX(CASE WHEN build_duration > :thresholdSec THEN build_time END) AS last_timeout_at
FROM jenkins_build_info
WHERE <shared base filter>
GROUP BY app_name, name_space
HAVING timeout_count > 0
ORDER BY timeout_count DESC;
```

Return `pipelines: []` when no pipelines have timeouts (200, not 404).

### Response L2 — with `appName` (200)

```typescript
{
  appName: string;
  thresholdSec: number;
  windowHours: number;
  builds: Array<{
    buildNumber: number;
    buildTime: string;       // ISO8601
    buildDuration: number;   // seconds
    buildStatus: string;
    buildUser: string | null;
    projectPath: string | null;
    gitlabUrl: string | null;
    managerEmail: string | null;
    securityTicketNum: string | null;
  }>;
}
```

Sorted by `build_time` descending. Only rows where `build_duration > thresholdSec`.

Return `builds: []` when the pipeline has no timeouts in the window (200).

### Errors

| Condition | Status | Code |
|-----------|--------|------|
| MySQL unreachable | 500 | `UPSTREAM_ERROR` |
| Invalid `windowHours` | 400 | `BAD_REQUEST` |

## UI: Pipeline Timeout Drill-down

### Route

`/pipelines/timeouts` — **Direct URL Route** (no sidebar link in v1). Reached by:

- Clicking **流水線超時率** on Global Matrix Dashboard (v1 only pipeline KPI with drill-down)
- Bookmark / runbook URL with query params

### Query parameters (URL)

| Param | Source | Adjustable on page |
|-------|--------|-------------------|
| `thresholdSec` | SRE admin default; set on navigation from dashboard | No (read-only in banner) |
| `windowHours` | SRE admin default; overridable | Yes — dropdown 24 / 48 / 168 |
| `appName` | Set when operator clicks L1 row | Back / clear removes param |

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  流水線逾時分析                    [← 返回儀表板]            │
├─────────────────────────────────────────────────────────────┤
│  Banner: 逾時閾值：300 秒（SRE 設定）· 視窗：[48 小時 ▾]    │
│  [清除 appName 篩選]  (when L2)                             │
├─────────────────────────────────────────────────────────────┤
│  L1 (no appName):                                           │
│  ┌─────────┬──────────┬──────┬──────┬──────┬──────────┐    │
│  │ 流水線  │ 命名空間 │ 逾時 │ 總數 │ 逾時率│ 最近逾時 │    │
│  └─────────┴──────────┴──────┴──────┴──────┴──────────┘    │
│                                                             │
│  L2 (appName set):                                          │
│  ┌────────┬──────────┬──────┬──────┬────────┬─────────┐    │
│  │ 建置編號│ 建置時間 │ 耗時 │ 狀態 │ 觸發者 │ GitLab… │    │
│  └────────┴──────────┴──────┴──────┴────────┴─────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Global Matrix Dashboard changes (v1)

1. **KpiCard** for 流水線超時率: click navigates to  
   `/pipelines/timeouts?thresholdSec={admin}&windowHours={admin}`  
   Visual affordance: pointer cursor / hover hint.
2. **`fetchPipelineMetrics`:** append `thresholdSec` and `windowHours` from localStorage helpers (mirror `getDashboardRefreshSec` pattern).
3. **流水線成功率:** not clickable in v1.

### Error states

Follow **Upstream Error State** (`CONTEXT.md`): MySQL failure → red error UI + message; no placeholder zeros. Register via `registerError('MySQL Database', ...)`.

## Phase 2 (out of v1 scope)

| Item | Notes |
|------|-------|
| Aborted / Failure KPIs | Requires confirmed `build_status` enum values from production data |
| Routes `/pipelines/aborted`, `/pipelines/failures` | Same two-level pattern as timeout |
| Success drill-down | Optional “healthy pipelines” view — not in v1 |
| Configurable exclusion list in SRE admin | v1 uses hardcoded Cluster Operator Build users |

## Implementation Checklist

- [ ] `src/lib/server/pipeline-filters.ts` — exclusions + shared WHERE fragment
- [ ] `src/lib/pipeline-metrics-config.ts` — read `pipeline_timeout_sec`, `pipeline_metrics_window_hours` from localStorage
- [ ] Extend `sre-settings-registry.ts` — two new 儀表板 fields
- [ ] Extend `GET /api/pipeline-metrics` — query params + shared filters
- [ ] Add `GET /api/pipeline-timeouts` — L1/L2 via optional `appName`
- [ ] Add `src/routes/pipelines/timeouts/+page.svelte`
- [ ] Wire timeout `KpiCard` click on `+page.svelte`
- [ ] Update `docs/data-flow.md`, `docs/README.md` API table

## Related

- ADR-0005 — Alert drill-down pattern (`activeFrom` / `activeTo`, banner, Direct URL Route)
- `docs/data-flow.md` — Pipeline Metrics flow
- `CONTEXT.md` — domain glossary (no implementation detail)
