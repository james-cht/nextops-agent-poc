import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * ADR-0035 authoring guardrail. SvelteKit does not auto-prefix root-relative
 * `/…` paths with `paths.base`, so a literal `href="/admin"` or `goto('/robusta?…')`
 * on a shared-host deploy silently escapes the app to the reverse-proxy host root
 * (tmdev intercepts and returns its own /login). Every in-app URL must go through
 * `publicHref(...)`, `$app/paths` `base`, or a lib helper that takes the Public
 * Base Path — not a raw string literal.
 *
 * Legitimate exceptions live in ALLOWLIST below (fragment/anchor, docs prototypes).
 */

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC_ROOT = join(REPO_ROOT, 'src');

/** Files where a root-relative URL is not a bug (curl fixtures, prototypes, tests). */
const ALLOWLIST = new Set<string>([
  // add relative-to-src paths using forward slashes, e.g. 'routes/foo/+page.svelte'
]);

function normalizeRelative(file: string): string {
  return relative(SRC_ROOT, file).split(sep).join('/');
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(p);
    } else {
      yield p;
    }
  }
}

function shouldScan(file: string): boolean {
  if (!/\.(svelte|ts|js|mts)$/.test(file)) return false;
  if (/\.test\.(ts|js|mts)$/.test(file)) return false;
  if (file.endsWith('kit-public-href.ts')) return false;
  if (file.endsWith('public-base-path.ts')) return false;
  return true;
}

interface Violation {
  file: string;
  line: number;
  match: string;
  reason: string;
}

// href="/…" literal (browser resolves relative to host root, escapes /nextops).
// Allow href="#…", href="{expr}", href="./…", href="http…", href="mailto:…" etc.
const HREF_LITERAL_RE = /\bhref\s*=\s*"\/[^"]*"/;

// goto('/…') / goto("/…") / goto(`/…`) with a literal leading slash.
// Allow goto(publicHref(…)) or goto(expr) or goto(`${base}/…`).
const GOTO_LITERAL_RE = /\bgoto\s*\(\s*(['"`])\/(?!\/)/;

// EventSource('/…') — the client fetch shim does not wrap SSE connections, so
// a literal leading slash escapes /nextops.
const EVENT_SOURCE_LITERAL_RE = /\bnew\s+EventSource\s*\(\s*(['"`])\//;

// SvelteKit `redirect(<code>, '/…')` / `throw redirect(303, '/…')` — server-side
// redirects that skip publicHref escape /nextops just like `goto('/…')`.
const REDIRECT_LITERAL_RE = /\bredirect\s*\(\s*\d{3}\s*,\s*(['"`])\//;

// Lib helpers that build in-app URLs should not emit `return "/…"` literals —
// they must take a base. Match `return '/foo?…'` etc.
const RETURN_LITERAL_RE = /\breturn\s+(['"`])\/[A-Za-z][^'"`\n]*(?:\?|\1)/;

function scanFile(file: string): Violation[] {
  const rel = normalizeRelative(file);
  if (ALLOWLIST.has(rel)) return [];
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const violations: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (HREF_LITERAL_RE.test(line)) {
      const match = line.match(HREF_LITERAL_RE)?.[0] ?? line.trim();
      violations.push({
        file: rel,
        line: i + 1,
        match,
        reason: 'literal href="/…" — wrap with publicHref() or use $app/paths base',
      });
    }
    if (GOTO_LITERAL_RE.test(line)) {
      const match = line.match(GOTO_LITERAL_RE)?.[0] ?? line.trim();
      violations.push({
        file: rel,
        line: i + 1,
        match,
        reason: 'literal goto("/…") — wrap with publicHref() or use a base-aware lib helper',
      });
    }
    if (RETURN_LITERAL_RE.test(line)) {
      const match = line.match(RETURN_LITERAL_RE)?.[0] ?? line.trim();
      violations.push({
        file: rel,
        line: i + 1,
        match,
        reason: 'lib returns a root-relative URL literal — accept a Public Base Path param',
      });
    }
    if (EVENT_SOURCE_LITERAL_RE.test(line)) {
      const match = line.match(EVENT_SOURCE_LITERAL_RE)?.[0] ?? line.trim();
      violations.push({
        file: rel,
        line: i + 1,
        match,
        reason: 'literal new EventSource("/…") — prefix with $app/paths base',
      });
    }
    if (REDIRECT_LITERAL_RE.test(line)) {
      const match = line.match(REDIRECT_LITERAL_RE)?.[0] ?? line.trim();
      violations.push({
        file: rel,
        line: i + 1,
        match,
        reason: 'literal redirect(<code>, "/…") — wrap the location with publicHref()',
      });
    }
  }
  return violations;
}

describe('Public Base Path authoring guardrail (ADR-0035)', () => {
  it('has no unprefixed href, goto, or lib-returned in-app URL under src/', () => {
    assert.ok(statSync(SRC_ROOT).isDirectory(), `expected ${SRC_ROOT} to exist`);
    const violations: Violation[] = [];
    for (const file of walk(SRC_ROOT)) {
      if (!shouldScan(file)) continue;
      violations.push(...scanFile(file));
    }
    if (violations.length > 0) {
      const message = violations
        .map((v) => `  ${v.file}:${v.line}  ${v.match}  — ${v.reason}`)
        .join('\n');
      assert.fail(
        `Root-relative URL literals must go through publicHref() / $app/paths base (ADR-0035):\n${message}`,
      );
    }
  });
});
