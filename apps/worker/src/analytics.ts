import type { QueueJobPayload, RenderOutputManifest } from "./payload";

export type WorkerAnalyticsEventName = "render_started" | "render_ready" | "render_failed";

export interface WorkerAnalyticsEventPayload {
  eventName: WorkerAnalyticsEventName;
  workspaceId: string;
  projectId: string;
  userId: string;
  sourceAssetId: string;
  renderJobId?: string;
  occurredAt: string;
  properties: Record<string, string | number | boolean>;
}

export interface WorkerAnalyticsSink {
  track(event: WorkerAnalyticsEventPayload): Promise<void>;
}

export async function trackWorkerRenderStartedBestEffort(input: {
  sink?: WorkerAnalyticsSink;
  payload: QueueJobPayload;
  renderJobId: string;
  workerMode: "mock" | "real";
  occurredAt: Date;
}): Promise<void> {
  await trackBestEffort(input.sink, {
    eventName: "render_started",
    ...baseEvent(input.payload, input.occurredAt, input.renderJobId),
    properties: {
      workerMode: input.workerMode,
      estimatedMinutes: input.payload.render.estimated_minutes,
      clipCount: input.payload.render.clip_count,
      templateVariant: input.payload.render.template.variant,
    },
  });
}

export async function trackWorkerRenderReadyBestEffort(input: {
  sink?: WorkerAnalyticsSink;
  payload: QueueJobPayload;
  renderJobId: string;
  workerMode: "mock" | "real";
  outputManifest: RenderOutputManifest;
  occurredAt: Date;
}): Promise<void> {
  const totalOutputBytes = input.outputManifest.outputs
    .reduce((sum, output) => sum + (output.sizeBytes ?? 0), 0);

  await trackBestEffort(input.sink, {
    eventName: "render_ready",
    ...baseEvent(input.payload, input.occurredAt, input.renderJobId),
    properties: {
      workerMode: input.workerMode,
      outputCount: input.outputManifest.outputs.length,
      totalOutputBytes,
    },
  });
}

export async function trackWorkerRenderFailedBestEffort(input: {
  sink?: WorkerAnalyticsSink;
  payload: QueueJobPayload;
  renderJobId?: string;
  workerMode: "mock" | "real";
  failureCode: string;
  occurredAt: Date;
}): Promise<void> {
  await trackBestEffort(input.sink, {
    eventName: "render_failed",
    ...baseEvent(input.payload, input.occurredAt, input.renderJobId),
    properties: {
      workerMode: input.workerMode,
      failureCode: input.failureCode,
    },
  });
}

async function trackBestEffort(
  sink: WorkerAnalyticsSink | undefined,
  event: WorkerAnalyticsEventPayload,
): Promise<void> {
  if (!sink) {
    return;
  }

  try {
    await sink.track(event);
  } catch (_error) {
    return;
  }
}

function baseEvent(
  payload: QueueJobPayload,
  occurredAt: Date,
  renderJobId: string | undefined,
) {
  return {
    workspaceId: payload.workspace_id,
    projectId: payload.project_id,
    userId: payload.user_id,
    sourceAssetId: payload.source_asset_id,
    ...(renderJobId ? { renderJobId } : {}),
    occurredAt: occurredAt.toISOString(),
  };
}
