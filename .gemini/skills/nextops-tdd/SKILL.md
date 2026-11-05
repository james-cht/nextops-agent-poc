---
name: nextops-tdd
description: Use when implementing or changing any NextOps behavior (src/lib helpers, routes, server code). Enforces red-green-refactor with node:test and the repo's npm test scripts.
---

# NextOps TDD

1. RED: add exactly one failing test for one observable behavior in the sibling `*.test.ts` (node:test, node:assert/strict). Run the matching npm script and confirm it fails for the expected reason.
2. GREEN: minimal code to pass. Re-run the script.
3. REFACTOR only while green.
4. Repeat per acceptance criterion. Never write all tests first and all code after.

Test scripts: `npm run test:alerts` (Alert Center filters), `npm run test:prometheus` (most src/lib), `npm run test:ops-check`.
Vocabulary must match CONTEXT.md. Never touch `.env*` or `kubeconfigs/`.
