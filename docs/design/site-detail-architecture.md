# Site Detail Page — Architectural Design

> **Task:** [P0] Issue #1 — Site Detail View (t_a92fc75d)
> **Role:** Architect
> **Child task:** t_4562816a (coding-agent implementation)
> **Created:** 2026-06-15

---

## 1. Component Tree

```
+layout.svelte (site-scoped)
 └─ +page.svelte (site detail)
      ├─ SiteHeader       — Title, cluster tag, status badge, Smart Logging link
      ├─ AlertSummary     — Expandable alert bar (critical/warning counts, future alert list)
      ├─ MetricsSection
      │    ├─ MetricCard  — K8S group (CPU/Memory/Disk bars)
      │    └─ MetricCard  — 節點 group (CPU/Memory/Disk bars)
      ├─ NodeStatusGrid   — Online / Total / Offline + host-type pills
      └─ SiteInfoCard     — Cluster tag, ES indices, Prometheus metrics
```

### Component Responsibilities (for extraction)

| Component | Props | Responsibility |
|-----------|-------|----------------|
| `SiteHeader` | `siteId, clusterTag, online, total` | Title + cluster tag + status badge + "Smart Logging" action link |
| `AlertSummary` | `critical, warning, alerts?` | Expandable alert bar; shows counts + future alert list from SSE |
| `MetricCard` | `title, metrics: {cpu, memory, disk}` | Metric group card with progress bars |
| `NodeStatusGrid` | `online, total, hostTypes[]` | Stat cards (Online/Total/Offline) + host-type pills |
| `SiteInfoCard` | `clusterTag, esIndices, promMetrics` | Site metadata in key-value layout |

---

## 2. Data Flow

```
Page Load ($effect)
      │
      ├──> GET /api/sites/{siteId}/overview  ──> polled every N seconds
      │         ├── metrics: { K8S: {cpu,mem,disk}, 節點: {cpu,mem,disk} }
      │         └── status: { online, total, alerts: {critical,warning,total} }
      │
      └──> GET /api/sites/{siteId}/describe  ──> loaded once on mount
                ├── clusterTag, hostTypes[]
                ├── esIndices: [{ pattern, description, fields, hostType }]
                └── prometheusMetrics: string[]
```

### Design Decisions
1. **Two independent calls** — `/overview` is polled (live metrics), `/describe` is static (metadata). Independent loading/error states.
2. **Client-side fetch** — `$effect` + `fetch` instead of `load()` because of polling requirements. Metrics are not SSR-critical.
3. **Error isolation** — If `/overview` fails, metrics section shows error card + retry. `/describe` failures only affect info section.

---

## 3. Navigation Flow

```
+page.svelte (overview / Dashboard)
  [SiteCard]─a href="/sites/{siteId}"─→ sites/[siteId]/+layout.svelte
                                           └─ Breadcrumb: Dashboard / {siteId}
                                           └─ sites/[siteId]/+page.svelte (detail view)
                                                └─ Links to: /logs?site={siteId}
```

✅ Overview cards already link to detail pages. Breadcrumb already implemented.

---

## 4. Responsive Layout

| Breakpoint | Metric Grid | Node Status |
|------------|-------------|-------------|
| ≥768px | 2 columns (K8S + 節點) | Horizontal row |
| <768px | 1 column (stacked) | Vertical stack |
| <480px | Single column, compact | Min-width auto |

Container: max-width 1200px centered.

---

## 5. Alert Display Area

States:
- **No alerts**: Green "✓ All Clear" indicator
- **Has alerts**: Red-tinted bar with critical/warning counts + expand toggle
- **Expanded**: Currently shows placeholder → replace with alert list when SSE is wired

---

## 6. Enhancement Notes for Coding Agent

| Priority | Item | Description |
|----------|------|-------------|
| **P0** | Alert placeholder | Replace "future update" text with link to `/alerts` |
| **P1** | `<svelte:head>` | Dynamic title per site: `{siteId} — NextOps` |
| **P1** | Component extraction | Extract MetricCard, AlertSummary, SiteHeader, NodeStatusGrid, SiteInfoCard → `$lib/components/` |
| **P2** | Language | UI spec calls for Traditional Chinese labels |
| **P2** | ES index detail | Show patterns/descriptions in SiteInfoCard |
| **P2** | Skeleton loaders | Replace text loaders with CSS-animated skeletons |
| **P3** | CSS custom properties | Prepare for dark theme (Issue #7 alignment) |

---

## 7. API Contracts

### GET /api/sites/{siteId}/overview
```typescript
{
  title: string;
  clusterId: string;
  metrics: {
    K8S: { cpu: number; memory: number; disk: number };
    '節點': { cpu: number; memory: number; disk: number };
  };
  status: {
    online: number;
    total: number;
    alerts: { critical: number; warning: number; total: number };
  };
}
```

### GET /api/sites/{siteId}/describe
```typescript
{
  siteId: string;
  clusterTag: string;
  hostTypes: string[];
  esIndices: Array<{
    pattern: string;
    description: string;
    fields: string[];
    hostType: string | string[];
  }>;
  prometheusMetrics: string[];
}
```

---

## 8. Implementation Order

1. Fix alert placeholder → link to `/alerts`
2. Add `<svelte:head>` with dynamic title
3. Extract components into `$lib/components/`
4. Update labels to Traditional Chinese
5. Expand ES index display in SiteInfoCard
6. Add skeleton loading animations
7. Verify end-to-end navigation
