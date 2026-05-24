import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import Ajv from "ajv";

import { planRenderWorkflow } from "../src/render-jobs/contract";
import type { CreateRenderJobBody } from "../src/render-jobs/types";

const VALID_REQUEST: CreateRenderJobBody = {
  workspaceId: "workspace_123",
  projectId: "project_456",
  userId: "user_789",
  sourceAssetId: "asset_abc",
  sourceFilename: "Founder demo.mov",
  sourceSizeBytes: 250_000_000,
  durationSeconds: 185,
  brandName: "ClipOps",
  audience: "founder-led B2B companies",
  clipCount: 4,
  platforms: ["tiktok", "instagram_reels", "youtube_shorts"],
};

describe("content_ops.render_job.v1 schema", () => {
  it("validates the API render-job queue payload", () => {
    const validate = loadRenderJobSchemaValidator();
    const plan = planRenderWorkflow({
      request: VALID_REQUEST,
      tier: "creator",
      usage: { activeRenderJobs: 1, renderedMinutesThisPeriod: 24 },
    });

    assert.equal(plan.accepted, true);
    assert.ok(plan.queueJob);
    assert.equal(validate(plan.queueJob.payload), true, JSON.stringify(validate.errors));
  });

  it("rejects undeclared credential fields", () => {
    const validate = loadRenderJobSchemaValidator();
    const plan = planRenderWorkflow({
      request: VALID_REQUEST,
      tier: "creator",
      usage: { activeRenderJobs: 1, renderedMinutesThisPeriod: 24 },
    });

    assert.ok(plan.queueJob);
    const payloadWithCredential = {
      ...plan.queueJob.payload,
      openai_api_key: "sk-never-queue-this",
    };

    assert.equal(validate(payloadWithCredential), false);
  });
});

function loadRenderJobSchemaValidator() {
  const schemaPath = resolve(process.cwd(), "schemas", "content-ops-render-job-v1.schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;
  const ajv = new Ajv({ allErrors: true });

  return ajv.compile(schema);
}
