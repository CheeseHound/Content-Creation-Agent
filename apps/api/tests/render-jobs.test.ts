import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createGetRenderJobHandler, createRenderJobHandler } from "../src/render-jobs/route";
import type {
  CreateRenderJobBody,
  RenderJobRecord,
  RenderJobRepository,
  RenderQueue,
  DownloadSigner,
  DownloadSignerRequest,
  UsageSnapshot,
  WorkspaceSubscription,
} from "../src/render-jobs/types";

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

describe("POST /api/render-jobs", () => {
  it("validates a request, records the render job, and returns a queue payload", async () => {
    const dependencies = createDependencies({
      subscription: { tier: "creator" },
      usage: { activeRenderJobs: 1, renderedMinutesThisPeriod: 24 },
    });
    const handler = createRenderJobHandler(dependencies);

    const response = await handler({ body: VALID_REQUEST });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    if (!response.body.success) {
      assert.fail("Expected render job creation to succeed.");
    }
    assert.equal(response.body.data.renderJob.status, "render_queued");
    assert.equal(response.body.data.renderJob.estimatedRenderMinutes, 16);
    assert.equal(response.body.data.queueJob.queueName, "content-ops-render");
    assert.equal(
      response.body.data.queueJob.idempotencyKey,
      "render:workspace_123:project_456:asset_abc:4:instagram_reels,tiktok,youtube_shorts",
    );
    assert.equal(response.body.data.queueJob.priority, 50);
    assert.equal(
      response.body.data.queueJob.payload.schema_version,
      "content_ops.render_job.v1",
    );
    assert.deepEqual(response.body.data.queueJob.payload.render.platforms, [
      "instagram_reels",
      "tiktok",
      "youtube_shorts",
    ]);
    assert.equal(
      response.body.data.queueJob.payload.storage.source_key,
      "workspaces/workspace_123/projects/project_456/uploads/asset_abc/founder-demo.mov",
    );
    assert.equal(dependencies.repository.createdJobs.length, 1);
    assert.equal(dependencies.queue.enqueuedJobs.length, 1);
    assert.doesNotMatch(JSON.stringify(response.body), /OPENAI_API_KEY|STRIPE_SECRET_KEY/);
  });

  it("rejects quota-exceeded requests before creating or enqueueing a job", async () => {
    const dependencies = createDependencies({
      subscription: { tier: "creator" },
      usage: { activeRenderJobs: 0, renderedMinutesThisPeriod: 175 },
    });
    const handler = createRenderJobHandler(dependencies);

    const response = await handler({
      body: {
        ...VALID_REQUEST,
        durationSeconds: 600,
        clipCount: 5,
      },
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);
    if (response.body.success) {
      assert.fail("Expected render job creation to fail quota validation.");
    }
    assert.equal(response.body.error.code, "quota_exceeded");
    assert.equal(response.body.error.message, "monthly render minute quota exceeded");
    assert.equal(dependencies.repository.createdJobs.length, 0);
    assert.equal(dependencies.queue.enqueuedJobs.length, 0);
  });

  it("returns field-level validation errors for malformed requests", async () => {
    const dependencies = createDependencies({
      subscription: { tier: "free" },
      usage: { activeRenderJobs: 0, renderedMinutesThisPeriod: 0 },
    });
    const handler = createRenderJobHandler(dependencies);

    const response = await handler({
      body: {
        ...VALID_REQUEST,
        sourceSizeBytes: 0,
        clipCount: 0,
        platforms: [],
      },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    if (response.body.success) {
      assert.fail("Expected render job creation to fail request validation.");
    }
    assert.equal(response.body.error.code, "validation_error");
    assert.ok(response.body.error.details);
    assert.deepEqual(
      response.body.error.details.map((detail) => detail.field),
      ["sourceSizeBytes", "clipCount", "platforms"],
    );
    assert.equal(dependencies.repository.createdJobs.length, 0);
    assert.equal(dependencies.queue.enqueuedJobs.length, 0);
  });

  it("returns a render job by id", async () => {
    const dependencies = createDependencies({
      subscription: { tier: "creator" },
      usage: { activeRenderJobs: 1, renderedMinutesThisPeriod: 24 },
    });
    const createHandler = createRenderJobHandler(dependencies);
    const getHandler = createGetRenderJobHandler(dependencies);

    const createResponse = await createHandler({ body: VALID_REQUEST });

    assert.equal(createResponse.status, 201);
    assert.equal(createResponse.body.success, true);
    if (!createResponse.body.success) {
      assert.fail("Expected render job creation to succeed.");
    }

    const getResponse = await getHandler({
      params: { id: createResponse.body.data.renderJob.id },
    });

    assert.equal(getResponse.status, 200);
    assert.equal(getResponse.body.success, true);
    if (!getResponse.body.success) {
      assert.fail("Expected render job readback to succeed.");
    }
    assert.equal(getResponse.body.data.id, createResponse.body.data.renderJob.id);
    assert.equal(getResponse.body.data.status, "render_queued");
    assert.deepEqual(getResponse.body.data.outputs, []);
  });

  it("adds signed download targets for ready render job outputs", async () => {
    const outputSigner = new FakeDownloadSigner();
    const dependencies = createDependencies({
      subscription: { tier: "creator" },
      usage: { activeRenderJobs: 0, renderedMinutesThisPeriod: 0 },
      outputSigner,
    });
    const getHandler = createGetRenderJobHandler(dependencies);
    dependencies.repository.createdJobs = [
      {
        ...READY_RENDER_JOB,
        outputManifest: {
          outputs: [
            {
              id: "clip_1",
              storageKey: "workspaces/workspace_123/projects/project_456/renders/asset_abc/clip-1.mp4",
              filename: "clip-1.mp4",
              contentType: "video/mp4",
              durationSeconds: 42,
              sizeBytes: 12_000_000,
            },
          ],
        },
      },
    ];

    const response = await getHandler({ params: { id: READY_RENDER_JOB.id } });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    if (!response.body.success) {
      assert.fail("Expected render job readback to succeed.");
    }
    assert.equal(response.body.data.status, "ready");
    assert.deepEqual(response.body.data.outputs, [
      {
        id: "clip_1",
        storageKey: "workspaces/workspace_123/projects/project_456/renders/asset_abc/clip-1.mp4",
        filename: "clip-1.mp4",
        contentType: "video/mp4",
        durationSeconds: 42,
        sizeBytes: 12_000_000,
        download: {
          method: "GET",
          url: "https://storage.local/workspaces%2Fworkspace_123%2Fprojects%2Fproject_456%2Frenders%2Fasset_abc%2Fclip-1.mp4",
          headers: {},
          expiresAt: "2026-05-22T12:15:00.000Z",
        },
      },
    ]);
    assert.deepEqual(outputSigner.requests, [
      {
        key: "workspaces/workspace_123/projects/project_456/renders/asset_abc/clip-1.mp4",
        responseContentType: "video/mp4",
        responseContentDisposition: "attachment; filename=\"clip-1.mp4\"",
        expiresAt: new Date("2026-05-22T12:15:00.000Z"),
      },
    ]);
    assert.doesNotMatch(JSON.stringify(response.body), /SECRET|ACCESS_KEY|OPENAI|STRIPE/);
  });

  it("does not sign output manifest keys outside the render output prefix", async () => {
    const dependencies = createDependencies({
      subscription: { tier: "creator" },
      usage: { activeRenderJobs: 0, renderedMinutesThisPeriod: 0 },
      outputSigner: new FakeDownloadSigner(),
    });
    const getHandler = createGetRenderJobHandler(dependencies);
    dependencies.repository.createdJobs = [
      {
        ...READY_RENDER_JOB,
        outputManifest: {
          outputs: [
            {
              id: "clip_1",
              storageKey: "workspaces/workspace_123/projects/project_456/uploads/asset_abc/source.mov",
              filename: "source.mov",
              contentType: "video/quicktime",
            },
          ],
        },
      },
    ];

    const response = await getHandler({ params: { id: READY_RENDER_JOB.id } });

    assert.equal(response.status, 500);
    assert.equal(response.body.success, false);
    if (response.body.success) {
      assert.fail("Expected unsafe output manifest to fail.");
    }
    assert.equal(response.body.error.message, "Unable to read render job.");
  });

  it("creates distinct render job ids for distinct platform sets", async () => {
    const dependencies = createDependencies({
      subscription: { tier: "studio" },
      usage: { activeRenderJobs: 0, renderedMinutesThisPeriod: 0 },
    });
    const handler = createRenderJobHandler(dependencies);

    const firstResponse = await handler({ body: VALID_REQUEST });
    const secondResponse = await handler({
      body: {
        ...VALID_REQUEST,
        platforms: ["linkedin", "youtube_shorts"],
      },
    });

    assert.equal(firstResponse.body.success, true);
    assert.equal(secondResponse.body.success, true);
    if (!firstResponse.body.success || !secondResponse.body.success) {
      assert.fail("Expected both render jobs to be accepted.");
    }
    assert.notEqual(firstResponse.body.data.renderJob.id, secondResponse.body.data.renderJob.id);
    assert.equal(dependencies.repository.createdJobs.length, 2);
  });

  it("returns not_found for missing render jobs", async () => {
    const dependencies = createDependencies({
      subscription: { tier: "creator" },
      usage: { activeRenderJobs: 0, renderedMinutesThisPeriod: 0 },
    });
    const handler = createGetRenderJobHandler(dependencies);

    const response = await handler({ params: { id: "render_job_missing" } });

    assert.equal(response.status, 404);
    assert.equal(response.body.success, false);
    if (response.body.success) {
      assert.fail("Expected missing render job readback to fail.");
    }
    assert.equal(response.body.error.code, "not_found");
  });
});

function createDependencies({
  subscription,
  usage,
  outputSigner,
}: {
  subscription: WorkspaceSubscription;
  usage: UsageSnapshot;
  outputSigner?: DownloadSigner;
}) {
  const repository = new InMemoryRenderJobRepository(subscription, usage);
  const queue = new InMemoryRenderQueue();
  return {
    repository,
    queue,
    outputSigner,
    now: () => new Date("2026-05-22T12:00:00.000Z"),
  };
}

class InMemoryRenderJobRepository implements RenderJobRepository {
  createdJobs: readonly RenderJobRecord[] = [];

  constructor(
    private readonly subscription: WorkspaceSubscription,
    private readonly usage: UsageSnapshot,
  ) {}

  async getWorkspaceSubscription(_workspaceId: string): Promise<WorkspaceSubscription> {
    return this.subscription;
  }

  async getUsageSnapshot(_workspaceId: string): Promise<UsageSnapshot> {
    return this.usage;
  }

  async createRenderJob(record: RenderJobRecord): Promise<RenderJobRecord> {
    this.createdJobs = [...this.createdJobs, record];
    return record;
  }

  async getRenderJobById(id: string): Promise<RenderJobRecord | undefined> {
    return this.createdJobs.find((job) => job.id === id);
  }
}

class InMemoryRenderQueue implements RenderQueue {
  enqueuedJobs: readonly unknown[] = [];

  async enqueue(job: unknown): Promise<void> {
    this.enqueuedJobs = [...this.enqueuedJobs, job];
  }
}

class FakeDownloadSigner implements DownloadSigner {
  requests: readonly DownloadSignerRequest[] = [];

  async presignDownload(request: DownloadSignerRequest) {
    this.requests = [...this.requests, request];

    return {
      method: "GET" as const,
      url: `https://storage.local/${encodeURIComponent(request.key)}`,
      headers: {},
      expiresAt: request.expiresAt.toISOString(),
    };
  }
}

const READY_RENDER_JOB: RenderJobRecord = {
  id: "render_job_ready",
  workspaceId: "workspace_123",
  projectId: "project_456",
  userId: "user_789",
  sourceAssetId: "asset_abc",
  status: "ready",
  estimatedRenderMinutes: 16,
  storageKeys: {
    source_key: "workspaces/workspace_123/projects/project_456/uploads/asset_abc/source.mov",
    audio_key: "workspaces/workspace_123/projects/project_456/audio/asset_abc/source.wav",
    transcript_key: "workspaces/workspace_123/projects/project_456/transcripts/asset_abc/transcript.json",
    render_output_prefix: "workspaces/workspace_123/projects/project_456/renders/asset_abc/",
  },
  queueJob: {
    queueName: "content-ops-render",
    idempotencyKey: "render:workspace_123:project_456:asset_abc:4:instagram_reels,tiktok,youtube_shorts",
    priority: 50,
    payload: {
      schema_version: "content_ops.render_job.v1",
      workspace_id: "workspace_123",
      project_id: "project_456",
      user_id: "user_789",
      source_asset_id: "asset_abc",
      subscription_tier: "creator",
      storage: {
        source_key: "workspaces/workspace_123/projects/project_456/uploads/asset_abc/source.mov",
        audio_key: "workspaces/workspace_123/projects/project_456/audio/asset_abc/source.wav",
        transcript_key: "workspaces/workspace_123/projects/project_456/transcripts/asset_abc/transcript.json",
        render_output_prefix: "workspaces/workspace_123/projects/project_456/renders/asset_abc/",
      },
      render: {
        brand_name: "ClipOps",
        audience: "founder-led B2B companies",
        clip_count: 4,
        platforms: ["instagram_reels", "tiktok", "youtube_shorts"],
        estimated_minutes: 16,
      },
    },
  },
};
