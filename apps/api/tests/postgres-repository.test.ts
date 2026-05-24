import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PostgresRenderJobRepository } from "../src/render-jobs/postgres-repository";
import type { QueueJob, RenderJobRecord } from "../src/render-jobs/types";

const STORAGE_KEYS = {
  source_key: "workspaces/workspace_123/projects/project_456/uploads/asset_abc/source.mov",
  audio_key: "workspaces/workspace_123/projects/project_456/audio/asset_abc/source.wav",
  transcript_key: "workspaces/workspace_123/projects/project_456/transcripts/asset_abc/transcript.json",
  render_output_prefix: "workspaces/workspace_123/projects/project_456/renders/asset_abc/",
};

const QUEUE_JOB: QueueJob = {
  queueName: "content-ops-render",
  idempotencyKey: "render:workspace_123:project_456:asset_abc:4:instagram_reels,tiktok",
  priority: 50,
  payload: {
    schema_version: "content_ops.render_job.v1",
    workspace_id: "workspace_123",
    project_id: "project_456",
    user_id: "user_789",
    source_asset_id: "asset_abc",
    subscription_tier: "creator",
    storage: STORAGE_KEYS,
    render: {
      brand_name: "ClipOps",
      audience: "founders",
      clip_count: 4,
      platforms: ["instagram_reels", "tiktok"],
      estimated_minutes: 16,
    },
  },
};

const RENDER_JOB: RenderJobRecord = {
  id: "render_job_workspace_123_project_456_asset_abc_4",
  workspaceId: "workspace_123",
  projectId: "project_456",
  userId: "user_789",
  sourceAssetId: "asset_abc",
  status: "render_queued",
  estimatedRenderMinutes: 16,
  storageKeys: STORAGE_KEYS,
  queueJob: QUEUE_JOB,
};

describe("PostgresRenderJobRepository", () => {
  it("falls back to the free subscription tier when no active subscription exists", async () => {
    const client = new FakePgClient([[]]);
    const repository = new PostgresRenderJobRepository(client);

    const subscription = await repository.getWorkspaceSubscription("workspace_123");

    assert.deepEqual(subscription, { tier: "free" });
    assert.match(client.queries[0]?.text ?? "", /from subscriptions/i);
  });

  it("maps usage snapshots from Postgres aggregate rows", async () => {
    const client = new FakePgClient([
      [
        {
          active_render_jobs: "2",
          rendered_minutes_this_period: "41",
        },
      ],
    ]);
    const repository = new PostgresRenderJobRepository(client);

    const usage = await repository.getUsageSnapshot("workspace_123");

    assert.deepEqual(usage, {
      activeRenderJobs: 2,
      renderedMinutesThisPeriod: 41,
    });
  });

  it("persists render jobs with idempotency and JSON payload columns", async () => {
    const client = new FakePgClient([[toRenderJobRow(RENDER_JOB)]]);
    const repository = new PostgresRenderJobRepository(client);

    const created = await repository.createRenderJob(RENDER_JOB);

    assert.deepEqual(created, RENDER_JOB);
    assert.match(client.queries[0]?.text ?? "", /insert into render_jobs/i);
    assert.ok(client.queries[0]?.values.includes(QUEUE_JOB.idempotencyKey));
    assert.ok(client.queries[0]?.values.includes(JSON.stringify(STORAGE_KEYS)));
    assert.ok(client.queries[0]?.values.includes(JSON.stringify(QUEUE_JOB)));
  });

  it("returns undefined when a render job cannot be found", async () => {
    const client = new FakePgClient([[]]);
    const repository = new PostgresRenderJobRepository(client);

    const result = await repository.getRenderJobById("render_job_missing");

    assert.equal(result, undefined);
    assert.match(client.queries[0]?.text ?? "", /from render_jobs/i);
  });

  it("maps output manifests for completed render jobs", async () => {
    const outputManifest = {
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
    };
    const client = new FakePgClient([
      [
        {
          ...toRenderJobRow({
            ...RENDER_JOB,
            status: "ready",
            outputManifest,
          }),
          output_manifest: JSON.stringify(outputManifest),
        },
      ],
    ]);
    const repository = new PostgresRenderJobRepository(client);

    const result = await repository.getRenderJobById(RENDER_JOB.id);

    assert.equal(result?.status, "ready");
    assert.deepEqual(result?.outputManifest, outputManifest);
    assert.match(client.queries[0]?.text ?? "", /output_manifest/i);
  });
});

function toRenderJobRow(record: RenderJobRecord) {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    project_id: record.projectId,
    user_id: record.userId,
    source_asset_id: record.sourceAssetId,
    status: record.status,
    estimated_render_minutes: record.estimatedRenderMinutes,
    storage_keys: record.storageKeys,
    queue_job: record.queueJob,
    output_manifest: record.outputManifest,
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
