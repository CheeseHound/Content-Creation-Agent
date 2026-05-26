import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PostgresEditBriefRepository } from "../src/edit-briefs/postgres-repository";
import type { EditBriefVersionRecord } from "../src/edit-briefs/types";

const EDIT_BRIEF_VERSION: EditBriefVersionRecord = {
  id: "edit_brief_version_workspace_123_project_456_asset_abc_1_fixture",
  editBriefId: "edit_brief_workspace_123_project_456_asset_abc",
  workspaceId: "workspace_123",
  projectId: "project_456",
  userId: "user_789",
  sourceAssetId: "asset_abc",
  versionNumber: 1,
  settings: {
    schemaVersion: "content_ops.edit_brief.v1",
    goal: "Cut the demo into launch clips.",
    tone: "funny",
    pacing: "fast",
    targetPlatforms: ["tiktok"],
    include: [],
    exclude: [],
    clipLengthSeconds: {
      min: 20,
      max: 40,
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
    editorialRules: [],
  },
  idempotencyKey: "edit-brief:workspace_123:project_456:asset_abc:fixture",
};

describe("PostgresEditBriefRepository", () => {
  it("persists edit briefs as append-only versions and marks the active version", async () => {
    const client = new FakePgClient([[toEditBriefVersionRow(EDIT_BRIEF_VERSION)]]);
    const repository = new PostgresEditBriefRepository(client);

    const created = await repository.createEditBriefVersion(EDIT_BRIEF_VERSION);

    assert.deepEqual(created, EDIT_BRIEF_VERSION);
    assert.match(client.queries[0]?.text ?? "", /insert into edit_briefs/i);
    assert.match(client.queries[0]?.text ?? "", /insert into edit_brief_versions/i);
    assert.match(client.queries[0]?.text ?? "", /active_version_number/i);
    assert.ok(client.queries[0]?.values.includes(JSON.stringify(EDIT_BRIEF_VERSION.settings)));
    assert.ok(client.queries[0]?.values.includes(EDIT_BRIEF_VERSION.idempotencyKey));
  });

  it("reads the active source-specific edit brief version for render planning", async () => {
    const client = new FakePgClient([[toEditBriefVersionRow(EDIT_BRIEF_VERSION)]]);
    const repository = new PostgresEditBriefRepository(client);

    const activeBrief = await repository.getActiveEditBrief({
      workspaceId: "workspace_123",
      projectId: "project_456",
      sourceAssetId: "asset_abc",
    });

    assert.deepEqual(activeBrief, {
      id: EDIT_BRIEF_VERSION.editBriefId,
      versionId: EDIT_BRIEF_VERSION.id,
      workspaceId: EDIT_BRIEF_VERSION.workspaceId,
      projectId: EDIT_BRIEF_VERSION.projectId,
      userId: EDIT_BRIEF_VERSION.userId,
      sourceAssetId: EDIT_BRIEF_VERSION.sourceAssetId,
      versionNumber: EDIT_BRIEF_VERSION.versionNumber,
      settings: EDIT_BRIEF_VERSION.settings,
    });
    assert.match(client.queries[0]?.text ?? "", /active_version_number/i);
    assert.match(client.queries[0]?.text ?? "", /source_asset_id = \$3/i);
    assert.deepEqual(client.queries[0]?.values, [
      "workspace_123",
      "project_456",
      "asset_abc",
    ]);
  });

  it("falls back to the project-level active edit brief when no source-specific brief exists", async () => {
    const projectBriefVersion = {
      ...EDIT_BRIEF_VERSION,
      editBriefId: "edit_brief_workspace_123_project_456_project",
      sourceAssetId: undefined,
    };
    const client = new FakePgClient([[toEditBriefVersionRow(projectBriefVersion)]]);
    const repository = new PostgresEditBriefRepository(client);

    const activeBrief = await repository.getActiveEditBrief({
      workspaceId: "workspace_123",
      projectId: "project_456",
      sourceAssetId: "asset_missing",
    });

    assert.equal(activeBrief?.id, projectBriefVersion.editBriefId);
    assert.equal(activeBrief?.sourceAssetId, undefined);
  });
});

function toEditBriefVersionRow(record: EditBriefVersionRecord) {
  return {
    id: record.id,
    edit_brief_id: record.editBriefId,
    workspace_id: record.workspaceId,
    project_id: record.projectId,
    user_id: record.userId,
    source_asset_id: record.sourceAssetId,
    version_number: record.versionNumber,
    settings: record.settings,
    idempotency_key: record.idempotencyKey,
  };
}

interface QueryCall {
  text: string;
  values: readonly unknown[];
}

class FakePgClient {
  queries: readonly QueryCall[] = [];
  private responses: readonly (readonly Record<string, unknown>[])[];

  constructor(responses: readonly (readonly Record<string, unknown>[])[]) {
    this.responses = responses;
  }

  async query<T>(text: string, values: readonly unknown[] = []): Promise<{ rows: T[] }> {
    const [rows = [], ...remainingResponses] = this.responses;
    this.responses = remainingResponses;
    this.queries = [...this.queries, { text, values }];

    return {
      rows: [...rows] as T[],
    };
  }
}
