import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createUploadPresignHandler } from "../src/uploads/route";
import type { ProductAnalyticsEventPayload, ProductAnalyticsSink } from "../src/analytics/types";
import type {
  CreateUploadPresignBody,
  MediaAssetRecord,
  UploadRepository,
  UploadSigner,
} from "../src/uploads/types";
import type { WorkspaceSubscription } from "../src/render-jobs/types";

const VALID_REQUEST: CreateUploadPresignBody = {
  workspaceId: "workspace_123",
  projectId: "project_456",
  userId: "user_789",
  filename: "Founder Demo.mov",
  contentType: "video/quicktime",
  sizeBytes: 250_000_000,
  durationSeconds: 185,
};

describe("POST /api/uploads/presign", () => {
  it("returns a signed upload target and records the media asset", async () => {
    const dependencies = createDependencies({
      subscription: { tier: "creator" },
      assetId: "asset_abc",
    });
    const handler = createUploadPresignHandler(dependencies);

    const response = await handler({ body: VALID_REQUEST });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    if (!response.body.success) {
      assert.fail("Expected upload presign to succeed.");
    }
    assert.equal(response.body.data.asset.id, "asset_abc");
    assert.equal(
      response.body.data.asset.sourceKey,
      "workspaces/workspace_123/projects/project_456/uploads/asset_abc/founder-demo.mov",
    );
    assert.deepEqual(response.body.data.upload, {
      method: "PUT",
      url: "https://storage.example/upload",
      headers: {
        "content-type": "video/quicktime",
      },
      expiresAt: "2026-05-22T12:15:00.000Z",
    });
    assert.equal(dependencies.uploadRepository.createdAssets.length, 1);
    assert.equal(
      dependencies.uploadRepository.createdAssets[0]?.sourceKey,
      "workspaces/workspace_123/projects/project_456/uploads/asset_abc/founder-demo.mov",
    );
    assert.equal(dependencies.signer.presignedKeys.length, 1);
    assert.doesNotMatch(JSON.stringify(response.body), /SECRET|ACCESS_KEY|localpass/);
  });

  it("emits a sanitized upload_presigned analytics event after recording the media asset", async () => {
    const analyticsSink = new RecordingAnalyticsSink();
    const dependencies = createDependencies({
      subscription: { tier: "creator" },
      assetId: "asset_abc",
      analyticsSink,
    });
    const handler = createUploadPresignHandler(dependencies);

    const response = await handler({ body: VALID_REQUEST });

    assert.equal(response.status, 201);
    assert.deepEqual(analyticsSink.events, [
      {
        eventName: "upload_presigned",
        workspaceId: "workspace_123",
        projectId: "project_456",
        userId: "user_789",
        sourceAssetId: "asset_abc",
        occurredAt: "2026-05-22T12:00:00.000Z",
        properties: {
          contentType: "video/quicktime",
          durationSeconds: 185,
          sizeBytes: 250_000_000,
          tier: "creator",
        },
      },
    ]);
    assert.doesNotMatch(
      JSON.stringify(analyticsSink.events),
      /Founder Demo|filename|sourceKey|storage|workspaces\/workspace_123/i,
    );
  });

  it("rejects uploads that exceed the workspace plan limit before signing", async () => {
    const dependencies = createDependencies({
      subscription: { tier: "free" },
      assetId: "asset_large",
    });
    const handler = createUploadPresignHandler(dependencies);

    const response = await handler({
      body: {
        ...VALID_REQUEST,
        sizeBytes: 600 * 1024 * 1024,
      },
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);
    if (response.body.success) {
      assert.fail("Expected upload presign to fail.");
    }
    assert.equal(response.body.error.code, "plan_limit_exceeded");
    assert.equal(dependencies.uploadRepository.createdAssets.length, 0);
    assert.equal(dependencies.signer.presignedKeys.length, 0);
  });

  it("returns field-level validation errors for malformed upload metadata", async () => {
    const dependencies = createDependencies({
      subscription: { tier: "creator" },
      assetId: "asset_abc",
    });
    const handler = createUploadPresignHandler(dependencies);

    const response = await handler({
      body: {
        ...VALID_REQUEST,
        filename: "",
        contentType: "application/javascript",
        sizeBytes: 0,
        durationSeconds: -1,
      },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    if (response.body.success) {
      assert.fail("Expected validation to fail.");
    }
    assert.deepEqual(
      response.body.error.details?.map((detail) => detail.field),
      ["filename", "sizeBytes", "durationSeconds", "contentType"],
    );
    assert.equal(dependencies.uploadRepository.createdAssets.length, 0);
    assert.equal(dependencies.signer.presignedKeys.length, 0);
  });
});

function createDependencies({
  subscription,
  assetId,
  analyticsSink,
}: {
  subscription: WorkspaceSubscription;
  assetId: string;
  analyticsSink?: ProductAnalyticsSink;
}) {
  const uploadRepository = new InMemoryUploadRepository(subscription);
  const signer = new FakeUploadSigner();

  return {
    uploadRepository,
    signer,
    createAssetId: () => assetId,
    now: () => new Date("2026-05-22T12:00:00.000Z"),
    analyticsSink,
  };
}

class InMemoryUploadRepository implements UploadRepository {
  createdAssets: readonly MediaAssetRecord[] = [];

  constructor(private readonly subscription: WorkspaceSubscription) {}

  async getWorkspaceSubscription(_workspaceId: string): Promise<WorkspaceSubscription> {
    return this.subscription;
  }

  async createMediaAsset(record: MediaAssetRecord): Promise<MediaAssetRecord> {
    this.createdAssets = [...this.createdAssets, record];
    return record;
  }
}

class RecordingAnalyticsSink implements ProductAnalyticsSink {
  events: readonly ProductAnalyticsEventPayload[] = [];

  async track(event: ProductAnalyticsEventPayload): Promise<void> {
    this.events = [...this.events, event];
  }
}

class FakeUploadSigner implements UploadSigner {
  presignedKeys: readonly string[] = [];

  async presignUpload(request: {
    key: string;
    contentType: string;
    expiresAt: Date;
  }) {
    this.presignedKeys = [...this.presignedKeys, request.key];

    return {
      method: "PUT" as const,
      url: "https://storage.example/upload",
      headers: {
        "content-type": request.contentType,
      },
      expiresAt: request.expiresAt.toISOString(),
    };
  }
}
