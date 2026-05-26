import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEditBriefHandler } from "../src/edit-briefs/route";
import type {
  CreateEditBriefBody,
  EditBriefRepository,
  EditBriefVersionRecord,
} from "../src/edit-briefs/types";

const VALID_REQUEST: CreateEditBriefBody = {
  workspaceId: "workspace_123",
  projectId: "project_456",
  userId: "user_789",
  sourceAssetId: "asset_abc",
  goal: "Turn the product demo into punchy clips for founder-led launch posts.",
  tone: "funny",
  pacing: "fast",
  targetPlatforms: ["youtube_shorts", "tiktok", "instagram_reels"],
  include: [
    {
      label: "Keep the dashboard reveal",
      startMs: 12_000,
      endMs: 26_000,
      reason: "This is the strongest product proof point.",
    },
  ],
  exclude: [
    {
      label: "Remove rambling intro",
      startMs: 0,
      endMs: 8_000,
    },
  ],
  clipLengthSeconds: {
    min: 25,
    max: 45,
  },
  captionStyle: {
    preset: "bold",
    density: "medium",
    emoji: false,
  },
  cropStrategy: "speaker_focus",
  music: {
    mood: "upbeat",
    allowLicensed: false,
  },
  editorialRules: [
    "Open on the most surprising line.",
    "Keep cuts tight and remove filler words.",
  ],
};

describe("POST /api/edit-briefs", () => {
  it("accepts an empty chat intent by applying deterministic default settings", async () => {
    const repository = new InMemoryEditBriefRepository();
    const handler = createEditBriefHandler({ editBriefRepository: repository });

    const response = await handler({
      body: {
        workspaceId: "workspace_123",
        projectId: "project_456",
        userId: "user_789",
        sourceAssetId: "asset_abc",
      },
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    if (!response.body.success) {
      assert.fail("Expected default edit brief creation to succeed.");
    }
    assert.equal(response.body.data.editBrief.settings.goal, "Create short-form clips from the uploaded source.");
    assert.equal(response.body.data.editBrief.settings.tone, "educational");
    assert.equal(response.body.data.editBrief.settings.pacing, "balanced");
    assert.deepEqual(response.body.data.editBrief.settings.targetPlatforms, [
      "instagram_reels",
      "tiktok",
      "youtube_shorts",
    ]);
    assert.deepEqual(response.body.data.editBrief.settings.clipLengthSeconds, {
      min: 20,
      max: 45,
    });
    assert.deepEqual(response.body.data.editBrief.settings.include, []);
    assert.deepEqual(response.body.data.editBrief.settings.exclude, []);
  });

  it("maps a nonblank chat message onto structured tweakable settings", async () => {
    const repository = new InMemoryEditBriefRepository();
    const handler = createEditBriefHandler({ editBriefRepository: repository });

    const response = await handler({
      body: {
        workspaceId: "workspace_123",
        projectId: "project_456",
        userId: "user_789",
        sourceAssetId: "asset_abc",
        chatMessage: "Make it funny and fast-paced for TikTok and LinkedIn. Keep dashboard reveal, remove rambling intro, use bold captions with upbeat music. 30-45 seconds.",
      },
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    if (!response.body.success) {
      assert.fail("Expected chat-derived edit brief creation to succeed.");
    }
    assert.equal(response.body.data.editBrief.settings.tone, "funny");
    assert.equal(response.body.data.editBrief.settings.pacing, "fast");
    assert.deepEqual(response.body.data.editBrief.settings.targetPlatforms, [
      "linkedin",
      "tiktok",
    ]);
    assert.deepEqual(response.body.data.editBrief.settings.include, [
      {
        label: "dashboard reveal",
      },
    ]);
    assert.deepEqual(response.body.data.editBrief.settings.exclude, [
      {
        label: "rambling intro",
      },
    ]);
    assert.deepEqual(response.body.data.editBrief.settings.clipLengthSeconds, {
      min: 30,
      max: 45,
    });
    assert.equal(response.body.data.editBrief.settings.captionStyle.preset, "bold");
    assert.equal(response.body.data.editBrief.settings.music.mood, "upbeat");
  });

  it("validates a structured edit brief and records version 1", async () => {
    const repository = new InMemoryEditBriefRepository();
    const handler = createEditBriefHandler({ editBriefRepository: repository });

    const response = await handler({ body: VALID_REQUEST });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    if (!response.body.success) {
      assert.fail("Expected edit brief creation to succeed.");
    }
    assert.equal(response.body.data.editBrief.id, "edit_brief_workspace_123_project_456_asset_abc");
    assert.equal(response.body.data.editBrief.versionNumber, 1);
    assert.equal(response.body.data.editBrief.settings.schemaVersion, "content_ops.edit_brief.v1");
    assert.deepEqual(response.body.data.editBrief.settings.targetPlatforms, [
      "instagram_reels",
      "tiktok",
      "youtube_shorts",
    ]);
    assert.deepEqual(response.body.data.editBrief.settings.clipLengthSeconds, {
      min: 25,
      max: 45,
    });
    assert.equal(repository.records.length, 1);
    assert.doesNotMatch(JSON.stringify(response.body), /OPENAI_API_KEY|STRIPE_SECRET_KEY|SECRET_ACCESS_KEY/);
  });

  it("creates a new version for the same project and source asset", async () => {
    const repository = new InMemoryEditBriefRepository();
    const handler = createEditBriefHandler({ editBriefRepository: repository });

    const firstResponse = await handler({ body: VALID_REQUEST });
    const secondResponse = await handler({
      body: {
        ...VALID_REQUEST,
        goal: "Make a calmer explainer version for LinkedIn and YouTube Shorts.",
        tone: "educational",
        pacing: "balanced",
        targetPlatforms: ["youtube_shorts", "linkedin"],
      },
    });

    assert.equal(firstResponse.body.success, true);
    assert.equal(secondResponse.status, 201);
    assert.equal(secondResponse.body.success, true);
    if (!secondResponse.body.success) {
      assert.fail("Expected second edit brief creation to succeed.");
    }
    assert.equal(secondResponse.body.data.editBrief.versionNumber, 2);
    assert.equal(secondResponse.body.data.editBrief.id, "edit_brief_workspace_123_project_456_asset_abc");
    assert.deepEqual(secondResponse.body.data.editBrief.settings.targetPlatforms, [
      "linkedin",
      "youtube_shorts",
    ]);
  });

  it("rejects oversized and unsafe free text before persistence", async () => {
    const repository = new InMemoryEditBriefRepository();
    const handler = createEditBriefHandler({ editBriefRepository: repository });

    const response = await handler({
      body: {
        ...VALID_REQUEST,
        chatMessage: "Use this token sk-never-put-this-in-a-brief",
        goal: "x".repeat(1_001),
        editorialRules: ["Use this token sk-never-put-this-in-a-brief"],
        include: [
          {
            label: "<script>alert(1)</script>",
          },
        ],
      },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    if (response.body.success) {
      assert.fail("Expected unsafe edit brief to fail request validation.");
    }
    assert.equal(response.body.error.code, "validation_error");
    assert.ok(response.body.error.details);
    assert.deepEqual(
      response.body.error.details.map((detail) => detail.field),
      ["chatMessage", "goal", "include[0].label", "editorialRules[0]"],
    );
    assert.equal(repository.records.length, 0);
  });
});

class InMemoryEditBriefRepository implements EditBriefRepository {
  records: readonly EditBriefVersionRecord[] = [];

  async createEditBriefVersion(record: EditBriefVersionRecord): Promise<EditBriefVersionRecord> {
    const versionNumber = this.records.filter((entry) => entry.editBriefId === record.editBriefId).length + 1;
    const createdRecord = {
      ...record,
      versionNumber,
    };
    this.records = [...this.records, createdRecord];
    return createdRecord;
  }
}
