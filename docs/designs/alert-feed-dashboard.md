# Alert Feed Dashboard — Detailed Design

> **Audience:** Coding-agent implementing task t_9633b31a
> **ADRs:** docs/adr/0005-alert-feed-sse-architecture.md
> **Domain terms:** See CONTEXT.md — "Site (Regional Cluster)", "Cluster Operator"

---

## 1. Architecture Overview

```
Alertmanager (Prometheus)
  | POST /api/alerts/webhook (Alertmanager JSON payload)
  v
SvelteKit Server
  ├── /api/alerts/webhook         → ingestAlerts() → dedup + store + broadcast
  ├── /api/alerts/stream          → SSE endpoint (real-time push)
  ├── /api/alerts                 → GET: filtered history + pagination
  │
  └── In-Memory Store (Map<fingerprint, Alert>)
        ├── getAllAlerts()        → history queries
        ├── getAlertSummary()     → badge counts
        ├── addClient()           → SSE registration
        ├── broadcast()           → push to all SSE clients
        └── pruneResolved()       → 24h TTL cleanup
              │
              v
        SSE Broadcast (all connected clients)
              │
     ┌────────┴────────┐
     ▼                  ▼
  EventSource         EventSource
  (/alerts page)      (layout → bell indicator)
```

**Data flow:**

1. Prometheus Alertmanager fires/resolves an alert → POSTs to `/api/alerts/webhook`
2. Server normalises Alertmanager payload to `Alert` shape, deduplicates by fingerprint
3. New/status-changed alerts are stored, broadcast to all SSE clients
4. Connected browsers receive `event: alert` in real-time
5. Newly connecting browsers receive `event: snapshot` with current alert state
6. Alert history page loads initial data via `GET /api/alerts`
7. Pruner cleans up resolved alerts older than 24h

---

## 2. SSE Endpoint: GET /api/alerts/stream

### Endpoint

```
GET /api/alerts/stream
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

### Implementation (in +server.ts)

```typescript
import { addClient, getAllAlerts, getAlertSummary } from '$lib/alert-manager';

export function GET({ request }) {
  const stream = new ReadableStream({
    start(controller) {
      // Send snapshot immediately on connect
      const snapshot = {
        type: 'snapshot',
        alerts: getAllAlerts(),
        summary: getAlertSummary(),
      };
      controller.enqueue(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);

      // Register this client for future broadcasts
      const cleanup = addClient(controller);

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(`event: heartbeat\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`);
        } catch {
          cleanup();
          clearInterval(heartbeat);
        }
      }, 30000);

      // Handle disconnect
      request.signal.addEventListener('abort', () => {
        cleanup();
        clearInterval(heartbeat);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### SSE Event Types

**event: snapshot** — Sent once on connection. Contains all current alerts and summary counts.

```
event: snapshot
data: {"type":"snapshot","alerts":[...],"summary":{"total":5,"firing":3,"critical":2,"warning":1,"info":0}}
```

**event: alert** — Sent when a new or status-changed alert is ingested.

```
event: alert
data: {"type":"alert","alert":{"id":"abc123","status":"firing","labels":{"severity":"critical","alertname":"HighCPULoad","cluster":"lh-k8s-cluster"},"annotations":{"summary":"CPU > 90% on node-5"},"startsAt":"2026-06-15T10:00:00Z","endsAt":null,"generatorURL":"http://prometheus/...","fingerprint":"abc123","receivedAt":"2026-06-15T10:00:01Z"}}
```

**event: heartbeat** — Sent every 30s during idle periods to prevent proxy timeouts.

```
event: heartbeat
data: {"ts":"2026-06-15T10:00:30.000Z"}
```

---

## 3. Enhanced Alert Manager: src/lib/alert-manager.ts

### New Functions to Add

The existing module has `ingestAlerts()`, `getAllAlerts()`, `getAlertsBySite()`, `getAlertSummary()`, `addClient()`, `startPruneInterval()`, and `stopPruneInterval()`. We need to add:

#### `getAlertsFiltered(filters: AlertFilters): { alerts: Alert[]; cursor: string | null; total: number }`

```typescript
interface AlertFilters {
  site?: string | string[];
  severity?: string | string[];
  status?: 'firing' | 'resolved' | 'all';
  timeFrom?: string;      // ISO8601
  timeTo?: string;        // ISO8601
  search?: string;        // search in alertname label
  cursor?: string;        // startsAt cursor for pagination
  limit?: number;         // default 50, max 200
}
```

Implementation:
1. Start with sorted alerts (newest startsAt first)
2. Apply filters sequentially:
   - If site: filter by `a.labels.cluster === site || a.labels.kubernetes_cluster === site`
   - If severity: filter by `a.labels.severity === severity`
   - If status: filter by `a.status === status` (unless 'all')
   - If timeFrom: filter by `a.startsAt >= timeFrom`
   - If timeTo: filter by `a.startsAt <= timeTo`
   - If search: filter by `a.labels.alertname.toLowerCase().includes(search)`
3. If cursor: find index of the cursor value in sorted array, slice from there
4. Apply limit, return slice + cursor for next page

#### `broadcastSnapshot(client: StreamController): void`

Send a snapshot event to a specific client (used by SSE endpoint on connect).

#### `getHeartbeat(): string`

Return A heartbeat SSE event string.

### Modifications to Existing Functions

**`broadcast(alert)`** — Currently broadcasts all alerts immediately. No change needed — only new/status-changed alerts are broadcast (the caller in `ingestAlerts()` controls this).

**`ingestAlerts()`** — Currently broadcasts new/updated alerts. Should remain unchanged. The broadcast path pushes to ALL connected clients.

---

## 4. History Query: GET /api/alerts

### Endpoint

```
GET /api/alerts?site=lh-k8s-cluster&severity=critical&status=firing&limit=50
```

### Response

```json
{
  "alerts": [
    {
      "id": "abc123",
      "status": "firing",
      "labels": { "severity": "critical", "alertname": "HighCPULoad", "cluster": "lh-k8s-cluster" },
      "annotations": { "summary": "CPU > 90% on node-5" },
      "startsAt": "2026-06-15T10:00:00Z",
      "endsAt": null,
      "generatorURL": "http://prometheus/...",
      "fingerprint": "abc123",
      "receivedAt": "2026-06-15T10:00:01Z"
    }
  ],
  "cursor": "2026-06-15T09:30:00Z",
  "total": 1,
  "summary": {
    "total": 5,
    "firing": 3,
    "critical": 2,
    "warning": 1,
    "info": 0
  }
}
```

### Implementation Notes

- The `cursor` field is the `startsAt` value of the last alert in the current page
- Client passes `cursor=2026-06-15T09:30:00Z` to get the next page (alerts older than that timestamp)
- `limit` is clamped between 1 and 200
- `total` is the count after applying filters (not cursor)
- `summary` is from `getAlertSummary()` (across ALL alerts, not filtered — gives context)

---

## 5. SSE Client: src/lib/alert-sse.ts

```typescript
interface AlertSSEOptions {
  onAlert?: (alert: Alert) => void;
  onSnapshot?: (alerts: Alert[], summary: AlertSummary) => void;
  onHeartbeat?: (ts: string) => void;
  onError?: (error: string) => void;
  onReconnect?: () => void;
  url?: string;     // default: '/api/alerts/stream'
}

class AlertSSE {
  private eventSource: EventSource | null = null;
  private options: AlertSSEOptions;

  constructor(options: AlertSSEOptions);
  connect(): void;              // creates EventSource, registers listeners
  close(): void;                // tears down EventSource
  reconnect(): void;            // close + connect
  get connected(): boolean;     // EventSource.readyState === OPEN
}
```

### Events Listened

| Event Name | Callback | Action |
|------------|----------|--------|
| `alert` | `onAlert` | JSON parse `data.alert`, pass to consumer |
| `snapshot` | `onSnapshot` | JSON parse `data.alerts` + `data.summary`, pass to consumer |
| `heartbeat` | `onHeartbeat` | Optional UI tick |
| `error` | `onError` | Connection error / reconnection |

### Reconnection

`EventSource` has built-in reconnection. The `onReconnect` callback fires on any error. The browser automatically retries. No custom reconnection logic is needed for V1.

---

## 6. UI: Alert History Page

### Route: `/alerts`

### State Shape (in +page.svelte)

```typescript
// Filters
let sites: string[] = [];               // selected site cluster_tags
let severities: string[] = [];          // selected severities
let statusFilter: string = 'all';       // 'firing' | 'resolved' | 'all'
let searchQuery: string = '';

// Data
let alerts: Alert[] = [];               // displayed alerts (filtered + paginated)
let cursor: string | null = null;        // pagination cursor
let totalCount: number = 0;

// Summary (from SSE snapshot + incremental updates)
let summary: AlertSummary = { total: 0, firing: 0, critical: 0, warning: 0, info: 0 };

// Status
let loading: boolean = true;
let error: string | null = null;
let sse: AlertSSE;

// Unread count (for bell)
// Shared via a module-level $state export or Svelte context
```

### Layout

```
┌──────────────────────────────────────────────────────────┐
│ 🔔 Alerts                                  🔍 Filters ▼ │
├──────────────────────────────────────────────────────────┤
│ ┌─── Summary Bar ────────────────────────────────────┐  │
│ │  🔴 2 Critical  🟡 5 Warning  🔵 3 Info  ✅ 12 Total│  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ ┌─── Filter Bar ───────────────────────────────────┐   │
│ │  Site: [All ▾]    Severity: [All ▾]              │   │
│ │  Status: [● Firing ○ Resolved ○ All]             │   │
│ │  Search: [............................]           │   │
│ └──────────────────────────────────────────────────┘   │
│                                                          │
│ ┌── Alert Row — Firing Critical ──────────────────┐    │
│ │  🔴 CRIT  HighCPULoad     龍華-生産  2m ago  ↗  │    │
│ │  CPU usage exceeds 90% threshold on node-5       │    │
│ │  ┌─ expanded ───────────────────────────────┐    │    │
│ │  │  Labels:   cluster=lh-k8s-cluster ...    │    │    │
│ │  │  Started:  2026-06-15T10:00:00Z          │    │    │
│ │  │  ↗ View in Prometheus                    │    │    │
│ │  └──────────────────────────────────────────┘    │    │
│ └──────────────────────────────────────────────────┘    │
│                                                          │
│ ┌── Alert Row — Resolved ─────────────────────────┐    │
│ │  ✅ WARN  HighMemoryUsage  越南-生産  resolved    │    │
│ │  Memory > 85% on worker-3 (Resolved 5m ago)      │    │
│ └──────────────────────────────────────────────────┘    │
│                                                          │
│ [Load More ↓]                                            │
└──────────────────────────────────────────────────────────┘
```

### Color Coding

| Severity | Badge | Text | Background |
|----------|-------|------|------------|
| critical | 🔴 #e74c3c | White | #fde8e8 |
| warning  | 🟡 #f39c12 | Dark  | #fef3e2 |
| info     | 🔵 #3498db | White | #e8f4fd |

Resolved alerts get a muted/gray treatment regardless of original severity.

### Interaction

1. **Page load** → Fetch `GET /api/alerts` + open SSE connection
2. **Filter change** → Re-fetch `GET /api/alerts` with new filter params
3. **Load More** → Fetch with `cursor` from previous response
4. **Click row** → Toggle expanded view (labels, annotations, generatorURL link)
5. **SSE alert event** → Prepend new alert to list (if matches current filters)
6. **SSE snapshot event** → Update summary counts, reconcile with current data
7. **Error state** → Show error banner with retry button
8. **Empty state** → "No alerts matching your filters" with reset button

---

## 7. UI: Alert Bell Indicator (Nav)

### Location

Added to `+layout.svelte` navigation bar.

### Implementation

```svelte
<script lang="ts">
  import AlertSSE from '$lib/alert-sse.svelte'; // or just inline the logic

  let unread = $state(0);
  let sse = new AlertSSE({
    onAlert(alert) {
      if (alert.status === 'firing') unread++;
      else if (alert.status === 'resolved' && unread > 0) unread--;
    },
    onSnapshot(alerts, summary) {
      unread = summary.firing;
    },
  });

  $effect(() => {
    sse.connect();
    return () => sse.close();
  });

  function goToAlerts() {
    unread = 0;   // mark all as read
    // navigate to /alerts
  }
</script>

<nav>
  <a href="/">Dashboard</a>
  <a href="/logs">Logs</a>
  <button onclick={goToAlerts}>
    🔔 {#if unread > 0}{unread}{/if}
  </button>
</nav>
```

### SSE Connection Lifecycle

- SSE connects once in the layout scope (not in page component)
- Survives page transitions (SvelteKit client-side routing)
- Disconnects when user navigates away from the app or closes the tab
- Reconnects automatically via `EventSource` native reconnection

### State Sharing

The `unread` count and the `AlertSSE` instance are owned by the layout. The overview page (`+page.svelte`) can optionally read them via Svelte context or a shared module-level store.

---

## 8. UI: Alert Badges on Site Cards (Overview)

### Current State

`+page.svelte` fetches per-site overviews via `GET /api/sites/[siteId]/overview`. The response already includes `status.alerts.critical` and `status.alerts.warning` from Prometheus' Alertmanager API.

### Enhancement Options

**Option A (recommended for V1):** Keep Prometheus polling for badge accuracy. Add a global unread bell indicator from the SSE subscription in the layout. Don't modify the site card badges in V1 — they update every 30s via the existing polling.

**Option B (if real-time badge updates are needed):** Add an SSE subscription in the overview page to overlay real-time deltas on top of Prometheus counts. More complex, needs per-site count management.

**Recommendation:** Implement Option A for V1. The 30s polling interval is sufficient for an overview page, and the bell indicator gives the operator an immediate signal when something fires.

---

## 9. Webhook Endpoint: Verification

The existing `POST /api/alerts/webhook` is already well-structured:

```typescript
export async function POST({ request }) {
  const body = await request.json();
  const alertList = body.alerts;
  // Normalise → ingestAlerts()
  // Returns { ok: true, ingested: count }
}
```

**No changes required** for V1. The `ingestAlerts()` function already:
- Deduplicates by fingerprint
- Broadcasts new/status-changed alerts to SSE clients
- Returns the count of new alerts ingested

---

## 10. File-by-File Actions

| File | Action | Purpose |
|------|--------|---------|
| src/lib/alert-manager.ts | **Modify** | Add `getAlertsFiltered()`, `broadcastSnapshot()`, heartbeat utility |
| src/routes/api/alerts/stream/+server.ts | **Create** | SSE endpoint with snapshot-on-connect + 30s heartbeat |
| src/routes/api/alerts/+server.ts | **Create** | GET endpoint for filtered history + pagination |
| src/lib/alert-sse.ts | **Create** | Typed `EventSource` wrapper class |
| src/routes/alerts/+page.svelte | **Create** | Alert history page: filter bar, list, summary, SSE sub |
| src/routes/+layout.svelte | **Modify** | Add alert bell with SSE sub + unread count |
| src/routes/+page.svelte | **Modify** | Add "Alerts" link (the actual badge real-time updates are V2 / Option B) |
| src/routes/api/alerts/webhook/+server.ts | **Verify** | Reads code—already correct, no changes needed |

---

## 11. Acceptance Criteria

| Criterion | Verification |
|-----------|-------------|
| POST alert → dedup + store | Curl POST with Alertmanager payload → no duplicate entries |
| POST alert → SSE broadcast | Connect to SSE stream → POST new alert → receive `event: alert` |
| Snapshot on SSE connect | Open SSE endpoint → receive `event: snapshot` with current alerts |
| Alert history page loads | GET /api/alerts → 200 with alert list |
| Filter by site | GET /api/alerts?site=lh-k8s-cluster → only that site's alerts |
| Filter by severity | GET /api/alerts?severity=critical → only critical alerts |
| Filter by status | GET /api/alerts?status=firing → only firing alerts |
| Pagination | GET /api/alerts?limit=10 → cursor returned → GET with cursor → next page |
| Alert bell in nav | Open app → bell shows firing count → POST new alert → count increments |
| Heartbeat | 30s idle → heartbeat event received on SSE stream |
| Reconnection | SSE disconnect → EventSource auto-reconnects |
| Pruning | Resolved alerts > 24h old are removed from store |

---

## 12. Implementation Order (Recommended)

1. **alert-manager.ts** — Add `getAlertsFiltered()`, `broadcastSnapshot()`, heartbeat
2. **alert-sse.ts** — Create the typed EventSource wrapper
3. **GET /api/alerts/stream** — Create SSE endpoint
4. **GET /api/alerts** — Create history query endpoint
5. **+layout.svelte** — Add alert bell with SSE subscription
6. **+page.svelte** — Add "Alerts" nav link (if not already in V2 layout)
7. **/alerts/+page.svelte** — Create alert history page (last, depends on everything above)

---

## 13. Edge Cases & Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Alertmanager sends empty alerts array | Return `{ ok: true, ingested: 0 }` — no-op |
| Alertmanager sends malformed payload | Return 400 `{ ok: false, error: 'Missing alerts array' }` |
| SSE client connects then immediately disconnects | `addClient()` registers, abort handler immediately cleans up |
| SSE client doesn't read fast enough | `ctrl.enqueue()` throws → catch → remove client |
| Multiple alerts with same fingerprint arrive rapidly | Last write wins (Map semantics) |
| Server memory grows unbounded | Pruner cleans resolved alerts after 24h. Firing alerts stay until resolved |
| GET /api/alerts with invalid cursor | Return alerts from newest (pagination reset) |
| No browsers connected (SSE) | Broadcast becomes no-op peacefully |
| Server restart | In-memory store is empty. SSE snapshots return empty. Next webhook repopulates |
