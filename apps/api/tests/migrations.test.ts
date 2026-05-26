import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

describe("content ops database migration", () => {
  it("creates the initial SaaS tables and idempotency constraints", () => {
    const migrationPath = resolve(
      process.cwd(),
      "apps",
      "api",
      "db",
      "migrations",
      "001_initial_content_ops.sql",
    );
    const sql = readFileSync(migrationPath, "utf8");

    for (const table of [
      "workspaces",
      "users",
      "workspace_members",
      "subscriptions",
      "projects",
      "media_assets",
      "edit_briefs",
      "edit_brief_versions",
      "edit_decision_lists",
      "render_jobs",
      "usage_ledger",
      "webhook_events",
    ]) {
      assert.match(sql, new RegExp(`create table if not exists ${table}\\b`, "i"));
    }

    assert.match(sql, /render_jobs[\s\S]+idempotency_key text not null unique/i);
    assert.match(sql, /edit_brief_versions[\s\S]+idempotency_key text not null unique/i);
    assert.match(sql, /edit_brief_versions[\s\S]+unique\s*\(\s*edit_brief_id\s*,\s*version_number\s*\)/i);
    assert.match(sql, /edit_decision_lists[\s\S]+idempotency_key text not null unique/i);
    assert.match(sql, /edit_decision_lists[\s\S]+schema_version text not null check \(schema_version = 'content_ops.edit_decision_list.v1'\)/i);
    assert.match(sql, /webhook_events[\s\S]+unique\s*\(\s*provider\s*,\s*event_id\s*\)/i);
    assert.doesNotMatch(sql, /api_key|secret/i);
  });
});
