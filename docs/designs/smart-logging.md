# Smart Logging Dashboard — Detailed Design

> **Audience:** Coding-agent implementing Smart Logging index routing
> **ADRs:** [0004](../adr/0004-smart-logging-sse-architecture.md) (SSE + polling), [0013](../adr/0013-log-index-factory-code-routing.md) (Factory Code index routing)
> **Domain terms:** CONTEXT.md — Smart Logging, Site, Factory Code, Default Log Mode, Log Index Pattern

---

## 1. Architecture Overview

```
Browser (EventSource)
  /logs -> +page.svelte <- log-stream.ts
       | SSE (text/event-stream)
       v
SvelteKit Server
  /api/logs/stream -> resolveLogIndex(siteId, mode, …) -> polls ES
  /api/es/query    -> same resolveLogIndex + search_after
  ES_BASE_URL + LOG_INDEX_PREFIX (server-only)
       | ES _search (server-side)
       v
Elasticsearch
  index: {prefix}-{factoryCode}-*  (narrowed by ns/pod or operator pattern)
```

**Data flow:**
1. User opens /logs, **must select one Site** → SSE to `/api/logs/stream?siteId=…&mode=…`
2. Server resolves index from Factory Code (default `{prefix}-{code}-*`); ISO-week expansion is opt-in (`expandWeeks`) because production indices often use daily suffixes
3. Poll every N seconds with filters + `search_after`; push `event: log`
4. Client buffer + auto-scroll; filter/mode/pattern changes restart SSE
5. "Load earlier" uses the same `resolveLogIndex` module via ES query path

**Index + document scope (ADR-0013):**
- Default index: always `logs-{code}-*` (optional operator pattern under site prefix)
- Log Namespace / Log Pod: document filters on `kubernetes.namespace_name` / `kubernetes.pod_name` — never rewrite the index string
- Document Filters from Log Field Table / JSON Tree (ADR-0021); `GET /api/logs/facets` is retired
- Optional ISO-week index expansion remains opt-in (`expandWeeks`)

---

## 2. SSE Endpoint: GET /api/logs/stream

### Query Parameters

| Param     | Type            | Default | Description |
|-----------|-----------------|---------|-------------|
| siteId    | string          | —       | **Required.** Single Site catalog key |
| mode      | `k8s`\|`non_k8s`| catalog / k8s | Log Host Mode for structured assembly |
| namespace | string          | —       | K8s only; document filter on `kubernetes.namespace_name` (does not rewrite index) |
| pod       | string          | —       | K8s only; document filter on `kubernetes.pod_name`; requires namespace |
| index     | string          | —       | Optional operator pattern (validated) |
| level     | string          | —       | Document `level` filter (repeatable) |
| timeFrom  | ISO8601         | now-1h  | `@timestamp` range |
| timeTo    | ISO8601         | now     | `@timestamp` range |
| keyword   | string          | —       | `query_string` across message/log fields |
| interval  | number          | 3       | Poll interval seconds (clamped 1–60) |

### SSE Event Types

**event: log** — A single log entry
```
event: log
data: {"_id":"abc123","_source":{"@timestamp":"2026-06-15T10:00:00.000Z","level":"error","message":"Connection refused","cluster_tag":"lh-k8s-cluster","service":"nginx","kubernetes":{"pod":"nginx-xxx","namespace":"production"},"host":"node-1"}}
```

**event: heartbeat** — Keepalive every poll cycle (even when no new logs)
```
event: heartbeat
data: {"ts":"2026-06-15T10:00:03.000Z","since":"2026-06-15T09:59:03.000Z"}
```

**event: snapshot** — Initial batch of historical logs (sent on connect)
```
event: snapshot
data: {"hits":[...],"cursor":["2026-06-15T09:59:00.000Z","xyz789"],"total":5230}
```

**event: error** — ES or server error
```
event: error
data: {"message":"ES query failed: connection timeout"}
```

---

## 3. Enhanced ES Query: POST /api/es/query

### Request Body (modified)

```typescript
{
  // Existing fields
  index: string;
  query: string;            // query_string syntax
  timeFrom?: string;        // ISO8601
  timeTo?: string;          // ISO8601
  size?: number;            // default 100, max 1000

  // New fields
  searchAfter?: any[];       // cursor from previous response (sort values)
  fields?: string[];         // source filter — optional
  siteId?: string;           // Factory Code resolution (required for log routing)
  level?: string | string[]; // log level filter
}
```

### Internal ES Query Built

```json
{
  "query": {
    "bool": {
      "must": [
        { "query_string": { "query": "<keyword>" } }
      ],
      "filter": [
        { "range": { "@timestamp": { "gte": "<timeFrom>", "lte": "<timeTo>" } } },
        { "terms": { "level": ["error", "warn"] } }
      ]
    }
  },
  "sort": [
    { "@timestamp": "desc" },
    { "_id": "desc" }         // tiebreaker for identical timestamps
  ],
  "size": 100,
  "search_after": ["<lastTimestamp>", "<lastId>"]   // optional
}
```

### Response (modified)

```typescript
{
  hits: Array<{
    _id: string;
    _source: LogEntry;
    sort: [string, string];  // [timestamp, _id] — use as next search_after
  }>;
  cursor: [string, string] | null;   // last sort values, null if no results
  total: number;                      // total matching count
}
```

### LogEntry Type

```typescript
interface LogEntry {
  "@timestamp": string;          // ISO8601
  level: string;                 // "error" | "warn" | "info" | "debug"
  message: string;
  cluster_tag?: string;          // site identifier
  service?: string;              // service/component name
  host?: string;
  kubernetes?: {
    pod?: string;
    container?: string;
    namespace?: string;
  };
  [key: string]: any;            // additional fields from filebeat
}
```

---

## 4. SSE Client: src/lib/log-stream.ts

```
LogStream class
  constructor(options: LogStreamOptions)
  connect()        — creates EventSource, registers listeners
  close()          — tears down EventSource
  reconnect(url)   — close + connect with new URL

LogStreamOptions:
  url: string
  onLog: (entry: LogEntry) => void
  onSnapshot?: (entries, cursor, total) => void
  onError?: (error: string) => void
  onReconnect?: () => void

Events listened:
  'log'       -> JSON parse -> onLog callback
  'snapshot'  -> JSON parse -> onSnapshot callback
  'heartbeat' -> optional UI tick
  'error'     -> onError or auto-reconnect detection
```

---

## 5. UI Component Layout

### Filter Bar (sticky top)

```
[Site: v 龍華 *required*]  [Mode: K8s | 非 K8s]  [Level: v Error,Warn]  [Time: v Last 1h]
[Namespace] [Pod]  [Index pattern (advanced)]  [Keyword: …] [3s] [Table v]
```

- **Site single-select (required)** — from GET /api/sites; Sites without Factory Code disabled
- **Mode toggle** — K8s / non-K8s; default from Site `defaultLogMode`, then personal localStorage
- **Namespace / Pod** — K8s mode only; prefill editable index pattern
- **Index pattern** — advanced editable; server validates prefix
- **Level Multi-Select** — Error, Warn, Info, Debug
- **Time Range** — 5m, 15m, 1h, 24h, Custom
- **Keyword Search** — 300ms debounce
- **Poll Interval** — 1s, 3s, 5s, 10s
- **View Mode** — Table | Raw | JSON

### Log Display

**Table Mode (default):**

| Timestamp | Level | Site | Service | Message |
|-----------|-------|------|---------|---------|
| 10:00:00  | ERROR | lh   | nginx   | Connect... |
| ...click to expand full JSON... |

**Raw Mode:**
```
[ERROR] 10:00:00 [nginx@lh-k8s] Connection refused to upstream backend
[INFO]  10:00:01 [kubelet@lh-k8s] Pod ready: nginx-xxx
```

**JSON Mode:**
```json
{
  "@timestamp": "2026-06-15T10:00:00.000Z",
  "level": "error",
  ...
}
```

### Color Coding

| Level       | Badge Color | Text Color |
|-------------|-------------|------------|
| error/crit  | Red (#e74c3c) | Red |
| warn        | Amber (#f39c12) | Amber |
| info        | Blue (#3498db) | Default |
| debug       | Gray (#95a5a6) | Gray |

### Controls

- **Auto-scroll toggle** — pause on scroll-up, resume on scroll-to-bottom
- **"Scroll to Bottom"** button (appears when auto-scroll paused)
- **"Load Earlier Logs"** button (at top) — fetch via search_after cursor
- **Connection status** — Connected (green) / Reconnecting (amber) / Error (red)

---

## 6. Pagination Strategy

### Polling Flow (Real-time)

1. Connect: fetch last 100 logs via `?timeFrom=now-1h` with no searchAfter
2. Store cursor = sort values of the last result
3. Each subsequent poll: searchAfter = cursor, timeFrom = now - (2 x interval) for overlap
4. New results appended to buffer
5. Buffer capped at 10,000 entries — old entries trimmed from top

### Historical Backfill ("Load Earlier")

1. User clicks "Load Earlier Logs"
2. Fetch next page using searchAfter from the FIRST result in current buffer
3. Prepend results to buffer (insert at top)
4. Cursor updates point to oldest loaded entry

### Why search_after not from/size

- from/size degrades exponentially past page ~100
- search_after uses cursor on sort values — O(1) per page regardless of depth
- Trade-off: no random page jump, but logging is sequential by nature

---

## 7. State Shape (in +page.svelte)

```typescript
// Filters
let siteId: string | null = null;   // required single Site
let mode: 'k8s' | 'non_k8s' = 'k8s';
let namespace: string = '';
let pod: string = '';
let indexPattern: string = '';      // advanced; empty => server default
let levels: string[] = [];
let timeRange: { from: string; to: string; preset: string };
let keyword: string = '';
let pollInterval: number = 3;

// Display
let viewMode: 'table' | 'raw' | 'json' = 'table';
let autoScroll: boolean = true;

// Data
let entries: LogEntry[] = [];       // main buffer (newest first, capped 10k)
let cursorTop: any[] | null = null;  // search_after for oldest (backfill)
let cursorBottom: any[] | null = null; // search_after for newest (polling)
let totalCount: number = 0;

// Status
let connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'error' = 'connecting';
let loadingMore: boolean = false;
let error: string | null = null;
```

---

## 8. File-by-File Actions

| File | Action | Purpose |
|------|--------|---------|
| src/routes/api/logs/stream/+server.ts | **Create** | SSE endpoint that polls ES with filters |
| src/lib/log-stream.ts | **Create** | Typed EventSource wrapper class |
| src/routes/logs/+page.svelte | **Create** | Smart Logging page with all UI |
| src/routes/api/es/query/+server.ts | **Modify** | Add search_after + site/level filters + cursor response |
| src/routes/+layout.svelte | **Modify** | Add "Logs" nav link after "Dashboard" |

---

## 9. Acceptance Criteria

| Criterion | Verification |
|-----------|-------------|
| SSE connects and streams logs | Open /logs, see entries appear within 3s |
| Filters work | Change site -> only that site's logs appear |
| Auto-scroll pause | Scroll up -> pauses. Scroll to bottom -> resumes. |
| Load earlier logs | Click "Load Earlier" -> older entries prepend |
| View mode toggle | Switch Table/Raw/JSON — all render correctly |
| Reconnection | Kill dev server -> "Reconnecting" -> restart -> resumes |
| ES unavailable | SSE sends error -> UI shows "ES unavailable" with retry |
