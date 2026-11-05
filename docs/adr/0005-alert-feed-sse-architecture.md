# ADR-0005: Alert Feed — Webhook → In-Memory Store → SSE

**Status:** Accepted
**Date:** 2026-06-15
**Context:** Alert Feed Dashboard needs real-time ingestion of Alertmanager webhook alerts, deduplication, SSE broadcast, and a filterable alert history page.
**Referenced by:** Issue #3 — Alert Feed Dashboard, Implementation task t_9633b31a

## Decision

Use **Alertmanager webhook → SvelteKit server → in-memory Map → SSE broadcast** with a REST query endpoint for history.

### Data Path

```
Alertmanager ──POST /api/alerts/webhook──> SvelteKit (dedup + store)
                                                │
                           ┌────────────────────┼────────────────────┐
                           ▼                    ▼                    ▼
                     In-Memory Map        SSE Broadcast        Pruner (24h TTL)
                     (fingerprint→Alert)   (all clients)       (resolved only)
                           │
                    ┌──────┴──────┐
                    ▼              ▼
            GET /api/alerts   GET /api/alerts/stream
            (history query)   (SSE real-time)
```

### Why Not

- **Redis:** Overkill for V1 single-instance. Move to Redis when horizontal scaling requires it.
- **Dify in critical path:** Dify is for on-demand AI diagnosis, not event delivery (per ADR-0003).
- **WebSocket:** SSE is simpler for one-way push; `EventSource` handles reconnection natively.
- **Direct Prometheus polling:** Alertmanager webhook gives push-based real-time delivery with proper lifecycle (firing/resolved).

## Data Model

The existing `Alert` interface in `src/lib/alert-manager.ts` is sufficient for V1:

| Field | Source | Purpose |
|-------|--------|---------|
| id (fingerprint) | Alertmanager | Unique alert identity |
| status: firing/resolved | Alertmanager | Current state |
| labels | Alertmanager | Severity, cluster, alertname, instance |
| annotations | Alertmanager | Summary, description, runbook |
| startsAt | Alertmanager | When alert condition was met |
| endsAt | Alertmanager | When alert resolved |
| generatorURL | Alertmanager | Link to Prometheus alert page |
| receivedAt | Server | When webhook received it |

Key label conventions expected:
- `severity` — "critical", "warning", "info" (for badge counts)
- `cluster` or `kubernetes_cluster` — maps to site's `clusterTag` (for per-site filtering)

## Deduplication Strategy

| Scenario | Behaviour |
|----------|-----------|
| New fingerprint | Insert, broadcast, increment ingested count |
| Same fingerprint + same status | Update labels/annotations/endsAt, no broadcast |
| Same fingerprint + status changed (firing→resolved) | Replace entry, broadcast (so UI can mark resolved) |
| Same fingerprint + status changed (resolved→firing) | Replace entry, broadcast (re-alerting) |
| Resolved + idle > 24h | Pruned by interval timer |

**Fingerprint** is the Alertmanager-generated hash of the alert's label set. Alertmanager guarantees it is stable for the same alert identity across firing/resolved cycles.

## SSE Stream Architecture

### Design: Single global stream

All connected clients receive all alerts. Client-side filtering by site via labels.

**Rationale:**
- Simpler server: one `Set<StreamController>`, one broadcast loop
- Negligible bandwidth at ops scale (tens of alerts per day, not millions)
- UI can show cross-site alerts instantly
- Future: optional `?site=clusterTag` query param for server-side filtering if needed

### SSE Event Types

```
event: alert
data: { "type": "alert", "alert": <Alert shape> }
          ── Fires when a new or status-changed alert is ingested

event: heartbeat
data: { "ts": "2026-06-15T10:00:30.000Z" }
          ── Sent every 30s to keep connection alive (no-alert periods)

event: snapshot
data: { "alerts": [...], "summary": { total, firing, critical, warning, info } }
          ── Sent on connect: current state-of-the-world for new clients
```

### Connection Lifecycle

1. Client connects to `/api/alerts/stream`
2. Server registers the connection, immediately sends `snapshot` with all current alerts
3. On each new `ingestAlerts()` call, server broadcasts `alert` to all connected clients
4. Every 30s, server sends `heartbeat` to prevent proxy/load-balancer timeouts
5. On client disconnect, server removes the controller (cleanup via `addClient()` return function)
6. On server shutdown, all SSE connections are closed gracefully

### Why snapshot-on-connect?

Without it, a client that connects during an idle period would never render any alerts until a new one fires. The snapshot provides the current alert state on connection, then incremental updates arrive as `alert` events.

## GET /api/alerts — History Query Endpoint

A new REST endpoint to load and filter alert history (used by the alert history page and as fallback for initial page load).

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| site | string | -- | Filter by cluster label. Repeatable. |
| severity | string | -- | Filter: "critical", "warning", "info". Repeatable. |
| status | string | -- | Filter: "firing", "resolved", "all". Default "all". |
| timeFrom | ISO8601 | -- | Return alerts with startsAt >= this |
| timeTo | ISO8601 | -- | Return alerts with startsAt <= this |
| cursor | string | -- | Opaque cursor from previous page for pagination |
| limit | number | 50 | Max results (max 200) |

### Response

```typescript
{
  alerts: Alert[];
  cursor: string | null;   // pass in next request for next page
  total: number;            // total matching count (estimate)
  summary: AlertSummary;    // counts across ALL alerts (not filtered)
}
```

### Data Source

Returned from `alert-manager.ts` — the in-memory Map. Sorting: newest `startsAt` first.

For V1, the cursor is simply the `startsAt` ISO string of the last result. This works correctly for chronological pagination because we sort by `startsAt` descending — the cursor is the last seen timestamp, and we return alerts older than it.

## UI: Alert History Page

### Route: `/alerts`

### Layout

```
┌─────────────────────────────────────────────────────┐
│  Alerts                              [Filter ▼]     │
├─────────────────────────────────────────────────────┤
│  ┌─────────────── Filter Bar ──────────────────┐    │
│  │  Site: [All ▾]  Severity: [All ▾]          │    │
│  │  Status: [All ▾]  Time: [Last 24h ▾]       │    │
│  │  [Search by alert name...]                  │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  Summary Bar: 12 firing · 3 critical · 5 warning    │
│                                                     │
│  ┌──── Alert Row ──────────────────────────────┐   │
│  │  🔴 CRIT  95% CPU  龍華-生産  2m ago  [↗]   │   │
│  │  CPU usage exceeds 90% threshold on node-5   │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──── Alert Row ──────────────────────────────┐   │
│  │  🟡 WARN  Memory > 85%  越南-生産  resolved │   │
│  │  Memory pressure on worker-3                 │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  [Load More ▼]                                      │
└─────────────────────────────────────────────────────┘
```

### Alert Row States

| State | Indicator | Action |
|-------|-----------|--------|
| Firing (critical) | 🔴 Badge | Pulse animation |
| Firing (warning)  | 🟡 Badge | Static |
| Firing (info)     | 🔵 Badge | Static |
| Resolved          | ✅ Badge | Fade/gray out |

### Interaction

- Click alert row → expand to show full labels, annotations, generatorURL link
- Summary bar counts update in real-time via SSE
- "Load More" button paginates via cursor
- Filter changes reload the data (restart SSE with new params? No — SSE delivers ALL alerts; client-side filter applied to display buffer)

## UI: Alert Bell Indicator (Nav)

### Location

Top-right of the navigation bar (`+layout.svelte`).

### Behaviour

```
[ 🔔 3 ]   ← when unread alerts > 0
[ 🔔 ]     ← when 0 unread
```

- Count = number of **firing** alerts at connect time + alerts that fired since last visit
- "Unread" is scoped to the session: resets to 0 when user navigates to /alerts
- SSE: a persistent EventSource connects in the layout scope (survives page navigation)
- On receiving `alert` event with status "firing" → increment badge
- On receiving `alert` event with status "resolved" → decrement badge (if was counted)

### Persistence

Unread count is a client-side Svelte rune ($state). No server-side tracking in V1. A page refresh resets to the current firing count from the snapshot.

## UI: Alert Badges on Site Cards (Overview)

### Current Approach

The overview page (`+page.svelte`) currently fetches alert counts from Prometheus' Alertmanager API (`/api/v1/alerts`), parsed in `prometheus.ts` via `parseAlerts()`.

### Enhancement

Add SSE subscription alongside the Prometheus polling:

1. **Initial load** — still from Prometheus (existing `loadSites()` flow)
2. **Real-time updates** — SSE `snapshot` event updates badge counts across all sites
3. **Incremental updates** — SSE `alert` event updates a single site's counters

When an alert fires:
- Parse `alert.labels.cluster` (or `kubernetes_cluster`) → find the site
- Increment that site's critical/warning count on the badge

When an alert resolves:
- Decrement the appropriate count

### Implementation Note

The site cards currently show `site.status.alerts.critical` and `site.status.alerts.warning` from Prometheus. The SSE updates should overlay on top of these numbers. If the SSE and Prometheus counts drift, the next polling cycle (every 30s) will correct them.

A simpler V1 approach: keep the Prometheus polling for badge counts (it already works), and only use SSE for new-toast notifications. The alert bell in the nav would be the primary real-time indicator.

## File-by-File Plan

| File | Action | Purpose |
|------|--------|---------|
| src/lib/alert-manager.ts | **Modify** | Add `getAlertsFiltered()` for history query, `getSnapshot()` for snapshot payload, `broadcastSnapshot()`, and heartbeat broadcast |
| src/routes/api/alerts/stream/+server.ts | **Create** | SSE endpoint: on connect → register client, send snapshot, start heartbeat interval |
| src/routes/api/alerts/+server.ts | **Create** | GET endpoint for alert history with filters + pagination |
| src/lib/alert-sse.ts | **Create** | Typed EventSource wrapper: connect, onAlert, onSnapshot, onHeartbeat, close |
| src/routes/alerts/+page.svelte | **Create** | Alert history page: filter bar, alert list, summary bar, SSE subscription |
| src/routes/+layout.svelte | **Modify** | Add alert bell with SSE subscription + unread count rune |
| src/routes/+page.svelte | **Modify** | Optionally add SSE-driven real-time badge updates to site cards |
| src/routes/api/alerts/webhook/+server.ts | **No changes needed** | Already calls `ingestAlerts()` which broadcasts — verify error handling |

## Acceptance Criteria

| Criterion | Verification |
|-----------|-------------|
| Alertmanager webhook ingests and deduplicates | POST alert payload → verify alert stored + no duplicates |
| SSE pushes new alerts | Connect to /api/alerts/stream → POST new alert → receive `alert` event |
| Snapshot on connect | Open /api/alerts/stream → receive initial `snapshot` with current alerts |
| Alert history page loads | GET /api/alerts → renders alert list with filters |
| Filter by site/severity/status | Apply filter → only matching alerts shown |
| Alert bell shows unread count | POST new alert → bell count increments |
| Connection resilience | Kill server → client shows "reconnecting" → restart → resumes |
| Heartbeat | No alerts for 30s → server sends heartbeat event |

## Future Considerations (V2)

- **Redis store** — Replace Map with Redis for multi-instance deployments
- **Acknowledge/Suppress** — Allow operators to acknowledge alerts (add `acknowledgedAt` field)
- **Client-side site filter** — `?site=clusterTag` query param on SSE endpoint to reduce bandwidth
- **Alert routing** — Route alerts to specific teams based on labels
- **Historical persistence** — Store resolved alerts in a database for long-term analysis
