import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

describe("content ops operator observability runbook", () => {
  it("documents the Phase 4 health, analytics, and signal surfaces", () => {
    const runbook = readFileSync(
      resolve(process.cwd(), "docs", "business", "shortform-content-ops-operator-runbook.md"),
      "utf8",
    );

    for (const requiredText of [
      "GET /healthz",
      "GET /readyz",
      "GET /internal/admin/analytics/summary",
      "CONTENT_OPS_ADMIN_TOKEN",
      "CONTENT_OPS_STORAGE_SECRET_ACCESS_KEY",
      "CONTENT_OPS_STORAGE_ACCESS_KEY_ID",
      "upload_presigned",
      "render_failed",
      "queue backlog age",
      "Postgres provider dashboard",
      "No raw prompts",
      "No raw transcripts",
      "No signed storage URLs",
    ]) {
      assert.match(runbook, new RegExp(escapeRegExp(requiredText)));
    }

    assert.doesNotMatch(runbook, /sk-[A-Za-z0-9_-]{8,}|local-secret-key|localpass/);
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
