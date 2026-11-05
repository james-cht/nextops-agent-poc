# ADR-0003: Alert flow via Alertmanager webhook → SvelteKit → SSE

Prometheus Alertmanager sends alerts directly to a SvelteKit webhook endpoint (not through Dify). SvelteKit stores the alert and pushes it to connected dashboard clients via Server-Sent Events (SSE). This keeps Dify out of the critical path for real-time notifications — Dify is reserved for on-demand AI diagnosis, not event delivery. WebSocket streaming was considered but SSE is simpler for one-way server-to-client data and natively reconnects.
