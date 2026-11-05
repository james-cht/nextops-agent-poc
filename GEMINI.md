# NextOps — Gemini CLI project context

NextOps is the AIOps dashboard (SvelteKit 2 + Svelte 5 + TypeScript, Node >= 22, Tailwind 4).
- `src/lib/*.ts` pure helpers, each with a sibling `*.test.ts` run by `node --experimental-strip-types --test`.
- `src/lib/server/` server-only code; `src/routes/` pages and `api/` endpoints.
- Domain vocabulary lives in `CONTEXT.md` (Alert Center, Active Window, Site, Operator Role...). Use those words.

## Rules
- TDD: write one failing test first, then minimal code, then refactor. Never ship code without a test.
- Keep pure helpers free of Svelte reactivity.
- Never read or print `.env*`, `kubeconfigs/`, tokens or passwords.
- Tests for Alert Center filters: `npm run test:alerts`.
- Reply in Traditional Chinese for prose; code and identifiers stay English.
- Write planning artifacts under `docs/demo/` (create if missing).
