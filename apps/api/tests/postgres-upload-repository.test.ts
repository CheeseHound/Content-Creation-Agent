import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PostgresUploadRepository } from "../src/uploads/postgres-repository";
import type { MediaAssetRecord } from "../src/uploads/types";

const MEDIA_ASSET: MediaAssetRecord = {
  id: "asset_abc",
  workspaceId: "workspace_123",
  projectId: "project_456",
  uploadedByUserId: "user_789",
  sourceKey: "workspaces/workspace_123/projects/project_456/uploads/asset_abc/founder-demo.mov",
  filename: "Founder Demo.mov",
  contentType: "video/quicktime",
  sizeBytes: 250_000_000,
  durationSeconds: 185,
};

describe("PostgresUploadRepository", () => {
  it("persists upload metadata for a presigned source asset", async () => {
    const client = new FakePgClient([[toMediaAssetRow(MEDIA_ASSET)]]);
    const repository = new PostgresUploadRepository(client);

    const created = await repository.createMediaAsset(MEDIA_ASSET);

    assert.deepEqual(created, MEDIA_ASSET);
    assert.match(client.queries[0]?.text ?? "", /insert into media_assets/i);
    assert.deepEqual(client.queries[0]?.values, [
      "asset_abc",
      "workspace_123",
      "project_456",
      "user_789",
      "workspaces/workspace_123/projects/project_456/uploads/asset_abc/founder-demo.mov",
      "Founder Demo.mov",
      "video/quicktime",
      250_000_000,
      185,
    ]);
  });

  it("reads workspace subscriptions for upload limit checks", async () => {
    const client = new FakePgClient([[{ tier: "studio" }]]);
    const repository = new PostgresUploadRepository(client);

    const subscription = await repository.getWorkspaceSubscription("workspace_123");

    assert.deepEqual(subscription, { tier: "studio" });
    assert.match(client.queries[0]?.text ?? "", /from subscriptions/i);
  });
});

function toMediaAssetRow(record: MediaAssetRecord) {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    project_id: record.projectId,
    uploaded_by_user_id: record.uploadedByUserId,
    source_key: record.sourceKey,
    filename: record.filename,
    content_type: record.contentType,
    size_bytes: String(record.sizeBytes),
    duration_seconds: record.durationSeconds,
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
