# ADR-0009: Sibling Tool Endpoint for Site Resource Health

## Status

Accepted

## Context

運維助手 (AI Diagnosis / OPSGPT) needs richer Prometheus signals than the dashboard-oriented `get_site_overview` snapshot: top-N nodes/VMs and pods/containers, restart counts, and short window deltas across `k8s`, `baremetal`, and `vm` (including docker where series exist). Expanding `SiteSnapshot` / `get_site_overview` would couple Global Matrix and Site Detail poll latency to diagnosis depth.

## Decision

Expose a sibling Tool Endpoint `get_site_resource_health` at `GET /api/sites/:siteId/resource-health`. Keep `get_site_overview` lean for dashboards. Dify Chatflow registers the new tool for Phase I resource diagnosis. PromQL for resource health lives as server-side defaults (not `/admin/promql` localStorage overrides). Elasticsearch log diagnosis remains Phase II.

## Consequences

- Dify Integrators must register one additional HTTP tool.
- Missing host-type series return `partial: true` and unavailable sections rather than failing the whole call when some data exists.
- Overview and resource-health can evolve independently; Site Catalog remains the Site identity source.
