# Dify Tool Endpoints — API Contract

> **Status:** v1.2 — Implemented  
> **Applies to:** NextOps SvelteKit backend  
> **Consumer:** Dify Chatflow agent (AI Diagnosis / 運維助手)  
> **Auth:** Bearer token shared between NextOps and Dify (env var `NEXTOPS_DIFY_TOKEN`)

---

## 1. Overview

The tool endpoints registered in Dify Chatflow for AI diagnosis:

| Tool Name | Method | Path | Purpose |
|---|---|---|---|
| `list_sites` | GET | `/api/sites` | List all cluster sites |
| `get_site_overview` | GET | `/api/sites/:siteId/overview` | Get live metrics for a site |
| `get_site_resource_health` | GET | `/api/sites/:siteId/resource-health` | Saturation, top offenders, restarts, deltas |
| `describe_site` | GET | `/api/sites/:siteId/describe` | Get site metadata (ES indices, metric list) |
| `query_elasticsearch` | POST | `/api/es/query` | Query Elasticsearch logs (Phase II diagnosis playbooks) |

Dify calls these endpoints during an AI Diagnosis flow. Each endpoint returns a JSON response. The SvelteKit backend fans out to Prometheus and Elasticsearch as needed. Unbound 運維助手 chat should use `list_sites` only until a Site is selected; metrics tools require `:siteId`.

---

## 2. Authentication

### 2.1 Dual Auth Strategy

Tool endpoints accept **two** authentication methods. The first match wins:

| Method | Mechanism | Used By |
|---|---|---|
| **Bearer Token** | `Authorization: Bearer <NEXTOPS_DIFY_TOKEN>` | Dify Chatflow (headless agent) |
| **Session Cookie** | `Cookie: session=authenticated` | Browser (developer testing) |

### 2.2 Bearer Token Flow

1. Dify sends `Authorization: Bearer <token>` on every tool request
2. Server validates token against `NEXTOPS_DIFY_TOKEN` env var
3. Invalid/missing token for tool paths → `401 Unauthorized` with structured error
4. Valid token → proceed to handler

### 2.3 Session Cookie Flow

1. Browser user authenticates via `/login`
2. SvelteKit `hooks.server.ts` validates session cookie
3. No valid session → `303 Redirect` to `/login` (existing behavior for UI paths), or `401 JSON` for tool paths
4. Valid session → proceed to handler

### 2.4 Implementation: hooks.server.ts

Implemented in `src/hooks.server.ts`. Tool paths include `/api/sites`, `/api/es`, and `/api/ai`:

```typescript
const TOOL_PATHS = ['/api/sites', '/api/es', '/api/ai'];
```

Tool paths check bearer token first, then fall through to session cookie check.

### 2.5 Dify Configuration

In Dify Chatflow, each tool endpoint is configured with:
- **Auth type:** Bearer
- **Token:** Same value as `NEXTOPS_DIFY_TOKEN` on the NextOps server
- **Header name:** `Authorization`
- **Header value:** `Bearer <token>`

---

## 3. Consistent Error Format

### 3.1 Error Response Schema

All errors follow this structure:

```json
{
  "error": {
    "code": "SITE_NOT_FOUND",
    "message": "The requested site was not found",
    "detail": "Site with id 'invalid-site' does not exist in configuration"
  }
}
```

| Field | Type | Description | Always present |
|---|---|---|---|
| `error.code` | string | Machine-readable error code (SCREAMING_SNAKE_CASE) | YES |
| `error.message` | string | Human-readable summary, suitable for logging | YES |
| `error.detail` | string | Additional context — the specific value, available options, etc. | Only when applicable |

### 3.2 Error Code Catalog

| HTTP Status | Error Code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Missing required field, invalid format |
| 400 | `INVALID_SITE_ID` | siteId param contains invalid characters |
| 401 | `UNAUTHORIZED` | Missing or invalid auth token |
| 403 | `FORBIDDEN` | Token valid but not authorized for this resource |
| 404 | `SITE_NOT_FOUND` | siteId does not match any configured site |
| 422 | `VALIDATION_ERROR` | Request body fails schema validation |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 502 | `UPSTREAM_ERROR` | External service (ES, Prometheus) returned an error |
| 502 | `ES_QUERY_FAILED` | Elasticsearch request failed |
| 502 | `PROMETHEUS_QUERY_FAILED` | Prometheus request failed |

### 3.3 Success Response Design

Responses return **data at the JSON root** (no wrapper envelope like `{data: ...}`) to keep Dify parsing simple — Dify extracts fields directly from the JSON root.

---

## 4. Endpoint: list_sites

### 4.1 Contract

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/api/sites` |
| **Auth** | Bearer token OR session cookie |
| **Content-Type** | `application/json` |
| **Request body** | None |

### 4.2 Success Response: `200 OK`

```json
[
  {
    "title": "龍華-生產",
    "clusterTag": "lh-k8s-cluster"
  },
  {
    "title": "重慶-生產",
    "clusterTag": "cq-k8s-cluster"
  },
  {
    "title": "煙台-生產",
    "clusterTag": "yt-k8s-cluster"
  },
  {
    "title": "越南-生產",
    "clusterTag": "amata-k8s-cluster"
  },
  {
    "title": "NA-生產",
    "clusterTag": "na-k8s-cluster"
  },
  {
    "title": "CTTV-生產",
    "clusterTag": "cttv-k8s-cluster"
  }
]
```

**TypeScript type:**
```typescript
type SiteSummary = {
  title: string;       // Human-readable site name, e.g. "龍華-生產"
  clusterTag: string;  // ES/Prometheus cluster identifier, e.g. "lh-k8s-cluster"
};

// Response: SiteSummary[]
```

### 4.3 Error Responses

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing/invalid auth |
| 500 | `INTERNAL_ERROR` | Config read failure |

### 4.4 Current Implementation Notes

- Currently returns `{title, clusterTag}` directly as an array — **keep this shape**, no breaking change needed
- Add guard against empty `SITE_CONFIGS` (return empty array, not error — Dify handles empty lists)

---

## 5. Endpoint: get_site_overview

### 5.1 Contract

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/api/sites/:siteId/overview` |
| **Auth** | Bearer token OR session cookie |
| **Content-Type** | `application/json` |
| **Request body** | None |
| **Path params** | `siteId` — site title (URL-encoded), e.g. `%E9%BE%8D%E8%8F%AF-%E7%94%9F%E7%94%A2` |

### 5.2 Success Response: `200 OK`

```json
{
  "title": "龍華-生產",
  "clusterId": "lh-k8s-cluster",
  "metrics": {
    "K8S": {
      "cpu": 32.15,
      "memory": 68.42,
      "disk": 45.0
    },
    "節點": {
      "cpu": 12.08,
      "memory": 41.23,
      "disk": 37.5
    }
  },
  "status": {
    "osNodes": { "online": 42, "total": 42 },
    "k8sNodes": { "online": 24, "total": 24 },
    "pods": { "online": 840, "total": 840 },
    "alerts": {
      "critical": 1,
      "warning": 3,
      "total": 4
    }
  }
}
```

**TypeScript type:**
```typescript
type SiteOverview = {
  title: string;
  clusterId: string;
  metrics: {
    K8S: { cpu: number; memory: number; disk: number };
    "節點": { cpu: number; memory: number; disk: number };
  };
  status: {
    osNodes: { online: number; total: number };
    k8sNodes: { online: number; total: number };
    pods: { online: number; total: number };
    alerts: { critical: number; warning: number; total: number };
  };
};
```

### 5.3 Error Responses

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_SITE_ID` | siteId contains unexpected characters (sanitization failure) |
| 401 | `UNAUTHORIZED` | Missing/invalid auth |
| 404 | `SITE_NOT_FOUND` | siteId not in SITE_CONFIGS |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 502 | `PROMETHEUS_QUERY_FAILED` | Prometheus upstream unreachable or returns errors |
| 502 | `UPSTREAM_ERROR` | Partial Prometheus failure (some queries fail) |

### 5.4 Partial Failure Design

When Prometheus returns errors for some queries but not all, the endpoint still returns 200 with `null` for failed metrics:

```json
{
  "title": "龍華-生產",
  "clusterId": "lh-k8s-cluster",
  "metrics": {
    "K8S": {
      "cpu": 32.15,
      "memory": 68.42,
      "disk": null
    },
    "節點": {
      "cpu": 12.08,
      "memory": 41.23,
      "disk": null
    }
  },
  "status": {
    "osNodes": { "online": 42, "total": 42 },
    "k8sNodes": { "online": 24, "total": 24 },
    "pods": { "online": 840, "total": 840 },
    "alerts": { "critical": 1, "warning": 3, "total": 4 }
  },
  "_warnings": ["disk query returned no data for cluster lh-k8s-cluster"]
}
```

- Optional `_warnings` array carries per-metric failure messages
- Individual metrics become `null` when their query fails
- Total upstream failure → `502 PROMETHEUS_QUERY_FAILED`

---

## 5b. Endpoint: get_site_resource_health

### 5b.1 Contract

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/api/sites/:siteId/resource-health` |
| **Auth** | Bearer token OR session cookie |
| **Content-Type** | `application/json` |
| **Request body** | None |
| **Path params** | `siteId` — site id (URL-encoded) |
| **Query params** | `topN` (optional, default `5`, max `20`) |

### 5b.2 Success Response: `200 OK`

```json
{
  "siteId": "cq-k8s-cluster",
  "clusterTag": "cq",
  "windows": { "instant": "5m", "short": "15m", "medium": "1h" },
  "topN": 5,
  "sections": [
    {
      "hostType": "k8s",
      "available": true,
      "saturation": { "cpu": 32.1, "memory": 68.4, "disk": 45.0 },
      "deltas": {
        "15m": { "cpu": 1.2, "memory": -0.5, "disk": 0.1 },
        "1h": { "cpu": 3.4, "memory": 1.1, "disk": 0.4 }
      }
    },
    {
      "hostType": "baremetal",
      "available": true,
      "saturation": { "cpu": 12.0, "memory": 41.2, "disk": 37.5 },
      "deltas": {
        "15m": { "cpu": 0.3, "memory": 0.1, "disk": 0.0 },
        "1h": { "cpu": 1.0, "memory": 0.8, "disk": 0.2 }
      }
    },
    {
      "hostType": "vm",
      "available": false,
      "saturation": null,
      "deltas": null
    },
    {
      "hostType": "docker",
      "available": true,
      "saturation": { "cpu": 8.5, "memory": null, "disk": null },
      "deltas": null
    }
  ],
  "top": {
    "nodes": [
      { "name": "192.0.2.4:9100", "kind": "node", "metric": "cpu", "value": 91.2, "labels": { "instance": "192.0.2.4:9100" } }
    ],
    "workloads": [
      { "name": "default/api-7d9f", "kind": "pod", "metric": "cpu", "value": 78.4, "labels": { "namespace": "default", "pod": "api-7d9f" } }
    ]
  },
  "restarts": {
    "pods": 12,
    "containers": null,
    "top": [
      { "name": "default/api-7d9f", "kind": "pod", "metric": "restarts", "value": 5, "labels": { "namespace": "default", "pod": "api-7d9f" } }
    ]
  },
  "partial": true,
  "warnings": ["vm section: no matching Prometheus series"],
  "generatedAt": "2026-07-22T07:00:00.000Z"
}
```

**TypeScript type:** see `SiteResourceHealth` in `src/lib/site-catalog-contract.ts`.

### 5b.3 Error Responses

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing/invalid auth |
| 404 | `SITE_NOT_FOUND` | siteId not in SITE_CONFIGS |
| 502 | `UPSTREAM_ERROR` | Unexpected Prometheus / server failure |

### 5b.4 Partial Failure Design

When some host-type sections or rankings have no series, the endpoint still returns `200` with `available: false` / empty arrays and `partial: true` plus `warnings`. Total inability to reach Prometheus with no usable series still returns a degraded payload with `partial: true` (same spirit as overview).

---

## 6. Endpoint: describe_site

### 6.1 Contract

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/api/sites/:siteId/describe` |
| **Auth** | Bearer token OR session cookie |
| **Content-Type** | `application/json` |
| **Request body** | None |

### 6.2 Success Response: `200 OK`

```json
{
  "siteId": "龍華",
  "clusterTag": "lh-k8s-cluster",
  "factoryCode": "lh",
  "defaultLogMode": "k8s",
  "hostTypes": ["k8s", "baremetal", "vm"],
  "esIndices": [
    {
      "pattern": "logs-lh-*",
      "description": "K8s logs for this Site. Default query pattern is logs-{factoryCode}-*. Narrow with Log Namespace / Log Pod document filters (kubernetes.namespace_name / kubernetes.pod_name), not index segments.",
      "fields": ["@timestamp", "level", "message", "host", "kubernetes.namespace_name", "kubernetes.pod_name"],
      "hostType": "k8s"
    },
    {
      "pattern": "logs-lh-*",
      "description": "Non-K8s logs for this Site. Default query pattern is logs-{factoryCode}-* (env equals factoryCode).",
      "fields": ["@timestamp", "level", "message", "host"],
      "hostType": ["baremetal", "vm"]
    }
  ],
  "prometheusMetrics": ["cpu", "memory", "disk", "node_online", "node_total"]
}
```

**TypeScript type:**
```typescript
type SiteDescription = {
  siteId: string;
  clusterTag: string;
  factoryCode: string;
  defaultLogMode: 'k8s' | 'non_k8s';
  hostTypes: string[];
  esIndices: ESIndex[];
  prometheusMetrics: string[];
};

type ESIndex = {
  pattern: string;
  description: string;
  fields: string[];
  hostType: string | string[];
};
```

Index contract: [ADR-0013](adr/0013-log-index-factory-code-routing.md). Both `esIndices` entries use the Site's default queryable pattern `logs-{factoryCode}-*`; descriptions carry the K8s vs non-K8s naming rules for agents.

### 6.3 Error Responses

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_SITE_ID` | siteId contains unexpected characters |
| 401 | `UNAUTHORIZED` | Missing/invalid auth |
| 404 | `SITE_NOT_FOUND` | siteId not in SITE_CONFIGS |
| 422 | `FACTORY_CODE_MISSING` | Site has no Factory Code (log tools unavailable) |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### 6.4 Current Implementation Notes

- Static catalog data — no upstream calls
- Must expose `factoryCode` / `defaultLogMode` and ADR-0013 `esIndices` (not legacy `k8s-events-*` / `syslog-*` lists)

---

## 7. Endpoint: query_elasticsearch

### 7.1 Contract

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/api/es/query` |
| **Auth** | Bearer token OR session cookie |
| **Content-Type** | `application/json` |
| **Request body** | JSON (see below) |

### 7.2 Request Body Schema

```json
{
  "index": "logs-lh-*",
  "query": "level:error AND message:timeout",
  "timeFrom": "2026-06-14T00:00:00Z",
  "timeTo": "2026-06-15T00:00:00Z",
  "size": 100,
  "searchAfter": null,
  "siteId": "龍華",
  "mode": "k8s",
  "namespace": "mes",
  "pod": "api-1",
  "level": "error"
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `index` | string | YES* | — | ES index pattern; must stay under the Site’s `{LOG_INDEX_PREFIX}-{factoryCode}` prefix ([ADR-0013](adr/0013-log-index-factory-code-routing.md)). *May be omitted when `siteId` is set — server fills `logs-{factoryCode}-*` |
| `query` | string | YES | — | Lucene query string syntax |
| `timeFrom` | string (ISO 8601) | NO | `null` | Start of time range |
| `timeTo` | string (ISO 8601) | NO | `null` | End of time range |
| `size` | number | NO | `100` | Max results (clamped to `1000`) |
| `searchAfter` | string[] | NO | `null` | Cursor for pagination |
| `siteId` | string | YES* | — | Single Site id for Factory Code resolution (*required for log routing; replaces legacy `site`/`cluster_tag` filter) |
| `mode` | `k8s` \| `non_k8s` | NO | Site `defaultLogMode` | Log Host Mode |
| `namespace` | string | NO | — | Log Namespace document filter (`kubernetes.namespace_name`); does not rewrite index |
| `pod` | string | NO | — | Log Pod document filter (`kubernetes.pod_name`); requires `namespace` |
| `level` | string \| string[] | NO | `null` | Filter by log level(s) |

### 7.3 Validation Rules

| Field | Rule |
|---|---|
| `index` | Non-empty when provided. Must start with `{LOG_INDEX_PREFIX}-{factoryCode}` for the bound Site; charset `[a-zA-Z0-9.*_-]`, length cap (e.g. 200). Reject `_` prefix, `..`, commas, whitespace → `INVALID_INDEX`. |
| `query` | Must be a non-empty string. Max 5000 characters. |
| `timeFrom` / `timeTo` | Must be valid ISO 8601 timestamps if provided. `timeFrom` must be before `timeTo`. |
| `size` | Must be a positive integer. Clamped to `[1, 1000]`. |
| `searchAfter` | Must be an array of strings/numbers if provided. |
| `siteId` | Must identify a configured Site with Factory Code; else `SITE_NOT_FOUND` / `FACTORY_CODE_MISSING`. |
| `level` | If provided, must be a non-empty string or array of non-empty strings. |

### 7.4 Success Response: `200 OK`

```json
{
  "hits": [
    {
      "_id": "abc123",
      "_source": { ... },
      "sort": ["2026-06-15T10:00:00Z", "doc123"]
    }
  ],
  "cursor": ["2026-06-15T10:00:00Z", "doc123"],
  "total": 1542
}
```

| Field | Type | Description |
|---|---|---|
| `hits` | array | Matching documents with `_id`, `_source`, and `sort` |
| `cursor` | string[] \| null | Pass as `searchAfter` in next request for pagination |
| `total` | number | Total matching documents (ES `total.value`) |

### 7.5 Error Responses

| Status | Code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Request body is not valid JSON |
| 400 | `MISSING_FIELD` | `index` or `query` missing |
| 400 | `INVALID_INDEX` | Index pattern is empty or suspicious |
| 400 | `INVALID_QUERY` | Query is empty or exceeds 5000 chars |
| 400 | `INVALID_TIME_RANGE` | `timeFrom` after `timeTo`, or invalid ISO format |
| 401 | `UNAUTHORIZED` | Missing/invalid auth |
| 422 | `VALIDATION_ERROR` | Multiple validation failures (returns all errors) |
| 502 | `ES_QUERY_FAILED` | Elasticsearch upstream error |

### 7.6 Pagination Design

- Uses ES `search_after` cursor-based pagination (already implemented)
- Client gets `cursor` in response, sends it back as `searchAfter` in next request
- No `from`/`size` offset pagination (avoids deep pagination inefficiency)
- Dify should limit to 2-3 pages max per diagnosis query

---

## 7a. Endpoint: log facets — retired

`GET /api/logs/facets` is removed (ADR-0021). Namespace / Pod discovery is Document Filters on the log JSON, not a dedicated facets API.

---

## 8. Cross-Cutting: Input Validation & Sanitization

### 8.1 Shared Validation Module

A shared utility module at `src/lib/validate.ts` provides:

| Function | Purpose |
|---|---|
| `ValidationError` | Custom error class with `code`, `message`, `detail` |
| `requireParam(value, name)` | Asserts non-empty string |
| `validateSiteId(siteId, validSites)` | Checks character safety + existence |
| `validateEsIndex(index)` | Checks pattern safety + length |
| `validateEsQuery(query)` | Checks length bounds |
| `validateTimeRange(from, to)` | Checks ISO format + ordering |

### 8.2 Sanitization Rules

| Input | Sanitization |
|---|---|
| `siteId` (path param) | Reject HTML special chars (`< > " '`), max 100 chars |
| `index` (ES query) | Reject leading `.`, `_`, `..`, max 200 chars |
| `query` (ES query) | Max 5000 chars, no truncation (Lucene syntax preserved) |
| `timeFrom`/`timeTo` | Reject non-ISO strings, validate ordering |
| `Authorization` header | Extract token after `Bearer ` prefix, reject malformed headers |

---

## 9. Cross-Cutting: Auth Implementation Contract

### 9.1 hooks.server.ts — Updated Logic

```typescript
const TOOL_PATHS = ['/api/sites', '/api/es', '/api/ai'];

function isToolPath(path: string): boolean {
  return TOOL_PATHS.some(prefix => path === prefix || path.startsWith(prefix + '/'));
}

// In handle():
// 1. Public paths (/login, /api/auth/*) → always allow
// 2. Tool paths with valid Bearer → allow
// 3. Any path with valid session → allow
// 4. Otherwise: tool paths → 401 JSON, UI paths → 303 /login
```

Key behaviors:
- Tool paths accept **either** bearer token or session cookie
- Valid bearer token skips the session check entirely
- Invalid/missing bearer + no session = `401 JSON` for tool paths, `303 redirect` for UI paths
- Non-tool, non-public paths always require session (unchanged)

---

## 10. Dify Tool Registration (via MCP Adapter)

Production registers Phase I tools through the **Tool Endpoint MCP Adapter** ([ADR-0015](adr/0015-tool-endpoint-mcp-adapter.md)), not Dify Custom OpenAPI tools. See [docs/dify/README.md](dify/README.md) and [mcp-servers.example.json](dify/mcp-servers.example.json).

### 10.1 MCP → Tool Endpoints

| MCP tool | Method | NextOps path (Adapter `NEXTOPS_TOOL_BASE`) | Auth |
|---|---|---|---|
| `list_sites` | GET | `/api/sites` | Bearer `<NEXTOPS_DIFY_TOKEN>` |
| `get_site_overview` | GET | `/api/sites/{{siteId}}/overview` | Bearer `<NEXTOPS_DIFY_TOKEN>` |
| `get_site_resource_health` | GET | `/api/sites/{{siteId}}/resource-health` | Bearer `<NEXTOPS_DIFY_TOKEN>` |
| `describe_site` | GET | `/api/sites/{{siteId}}/describe` | Bearer `<NEXTOPS_DIFY_TOKEN>` |
| `query_elasticsearch` | POST | `/api/es/query` | Phase II (not in Adapter allowlist yet) |

Dify MCP client URL: `http(s)://<host>:3100/mcp` with the same Bearer token.

### 10.2 Parameter Mapping (Agent → Endpoint)

For `get_site_overview`, `get_site_resource_health`, and `describe_site`:
- Agent argument `siteId` → path param `:siteId` (URL-encoded by the Adapter)

For `query_elasticsearch`:
- Dify JSON body → request body fields as defined in §7.2

---

## 11. Implementation Status

| Area | Status |
|------|--------|
| Bearer auth on tool paths | ✅ Implemented (`hooks.server.ts`) |
| Session auth for UI | ✅ Implemented |
| `list_sites`, `describe_site` | ✅ Implemented |
| `get_site_overview` | ✅ Implemented (returns HTTP 502 when Prometheus unreachable) |
| `get_site_resource_health` | ✅ Implemented (Phase I; partial sections when series missing) |
| `query_elasticsearch` | ✅ Implemented |
| Structured error format | ✅ Partial (`src/lib/errors.ts`) |
| Shared validation module | ⏳ Planned (`src/lib/validate.ts`) |
| `.env.example` | ✅ Created at repo root |

See [Configuration Reference](configuration.md) for all environment variables.

---

## Appendix: Response Format Comparison

| Scenario | Before | After |
|---|---|---|
| Error format | `{error: "message string"}` | `{error: {code, message, detail}}` |
| Auth failure (tool) | `303 → /login` | `401 {code: "UNAUTHORIZED", ...}` |
| Auth failure (UI) | `303 → /login` | `303 → /login` (unchanged) |
| Partial metric failure | `500` (whole endpoint fails) | `200` with `null` metrics + `_warnings` |
| Site not found | `404 {error: 'Site not found'}` | `404 {code: "SITE_NOT_FOUND", ...}` |
| ES missing fields | `400 {error: 'message'}` | `400 {code: "MISSING_FIELD", ...}` |
