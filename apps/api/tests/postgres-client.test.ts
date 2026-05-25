import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizePostgresRows } from "../src/db/postgres-client";

describe("normalizePostgresRows", () => {
  it("returns rows from a single pg query result", () => {
    assert.deepEqual(normalizePostgresRows({
      command: "SELECT",
      rows: [{ ok: true }],
    }), [{ ok: true }]);
  });

  it("flattens rows from pg multi-statement query results", () => {
    assert.deepEqual(normalizePostgresRows([
      { command: "CREATE", rows: [] },
      { command: "SELECT", rows: [{ name: "001_initial_content_ops.sql" }] },
      { command: "INSERT", rows: [] },
    ]), [{ name: "001_initial_content_ops.sql" }]);
  });

  it("treats command-only pg results as no-row results", () => {
    assert.deepEqual(normalizePostgresRows({ command: "CREATE" }), []);
  });
});
