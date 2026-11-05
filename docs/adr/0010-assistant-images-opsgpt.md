# ADR-0010: Assistant Images in OPSGPT via allowlisted end-of-stream enrichment

OPSGPT (AI Diagnosis) may show Assistant Images from Dify replies for knowledge/diagnosis answers. Images are remote HTTPS URLs only (no operator upload, no base64). NextOps keeps Dify SSE pass-through for text, then emits a final custom `assistant_images` event after `message_end` with allowlist-validated URLs (max 3), blocked hostnames, and truncation notices. The Image Allowlist is server env (defaulting to include the Dify host from `DIFY_BASE_URL`), not browser admin settings. Hybrid extraction covers native Dify fields, fenced `media` JSON, and markdown images; structured markers are stripped from visible text. Chat continues the in-memory Dify `conversation_id` until Site context changes or the page reloads.

**Considered options:** full stream normalization (heavier, harder to reverse); open HTTPS allow-any (weaker security); admin-localStorage allowlist (inconsistent across pods, client-tunable security); mid-stream image paint (layout jank vs text-first).

**Consequences:** Dify Integrators must ensure image hosts are allowlisted; frontend must handle the custom event and Blocked Image Notices; browsers still load images directly from allowlisted hosts (CORS/404 surface as load-failed notices).
