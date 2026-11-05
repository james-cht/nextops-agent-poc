# ADR-0001: Single SvelteKit service for UI and API

The existing prototype used a separate FastAPI backend as a Prometheus data proxy. We decided to consolidate into a single SvelteKit service that serves both the dashboard UI and all API endpoints (including those consumed by Dify). This avoids maintaining two services in two languages (Python + TypeScript) and keeps auth, data fan-out logic, and deployment in one place. The Prometheus fan-out logic is compact enough (~100 lines) to port straightforwardly into SvelteKit `+server.ts` endpoints.
