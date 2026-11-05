import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDocumentFilterClauses,
  parseDocumentFiltersParam,
} from "./log-document-filter.ts";

test("empty / null input returns ok: true and empty filters", () => {
  assert.deepStrictEqual(parseDocumentFiltersParam(""), { ok: true, filters: [] });
  assert.deepStrictEqual(parseDocumentFiltersParam(null), { ok: true, filters: [] });
  assert.deepStrictEqual(parseDocumentFiltersParam(undefined), { ok: true, filters: [] });
});

test("invalid JSON returns ok: false", () => {
  const result = parseDocumentFiltersParam("invalid json");
  assert.strictEqual(result.ok, false);
});

test("valid JSON array parses filter and yields term clause", () => {
  const raw = JSON.stringify([{ path: "status", value: 200 }]);
  const result = parseDocumentFiltersParam(raw);

  assert.strictEqual(result.ok, true);
  if (result.ok) {
    assert.strictEqual(result.filters.length, 1);
    assert.deepStrictEqual(result.filters[0], { path: "status", value: 200 });

    const clauses = buildDocumentFilterClauses(result.filters);
    assert.deepStrictEqual(clauses, [{ term: { status: 200 } }]);
  }
});
