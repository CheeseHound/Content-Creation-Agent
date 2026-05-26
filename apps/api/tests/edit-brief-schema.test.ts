import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import Ajv from "ajv";

import { buildEditBriefSettings } from "../src/edit-briefs/contract";
import type { CreateEditBriefBody } from "../src/edit-briefs/types";

const VALID_REQUEST: CreateEditBriefBody = {
  workspaceId: "workspace_123",
  projectId: "project_456",
  userId: "user_789",
  sourceAssetId: "asset_abc",
  goal: "Cut a high-retention launch clip from the strongest demo segment.",
  tone: "authoritative",
  pacing: "fast",
  targetPlatforms: ["tiktok", "youtube_shorts"],
  include: [
    {
      label: "Dashboard reveal",
      startMs: 10_000,
      endMs: 22_000,
    },
  ],
  exclude: [],
  clipLengthSeconds: {
    min: 20,
    max: 40,
  },
  captionStyle: {
    preset: "karaoke",
    density: "high",
    emoji: true,
  },
  cropStrategy: "auto_subject",
  music: {
    mood: "dramatic",
    allowLicensed: false,
  },
  editorialRules: ["Start with proof before context."],
};

describe("content_ops.edit_brief.v1 schema", () => {
  it("validates normalized edit brief settings", () => {
    const validate = loadEditBriefSchemaValidator();
    const settings = buildEditBriefSettings(VALID_REQUEST);

    assert.equal(validate(settings), true, JSON.stringify(validate.errors));
  });

  it("rejects undeclared credential fields", () => {
    const validate = loadEditBriefSchemaValidator();
    const settings = {
      ...buildEditBriefSettings(VALID_REQUEST),
      openai_api_key: "sk-never-store-this",
    };

    assert.equal(validate(settings), false);
  });
});

function loadEditBriefSchemaValidator() {
  const schemaPath = resolve(process.cwd(), "schemas", "content-ops-edit-brief-v1.schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;
  const ajv = new Ajv({ allErrors: true });

  return ajv.compile(schema);
}
