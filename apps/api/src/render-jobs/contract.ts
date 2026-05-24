import type {
  CreateRenderJobBody,
  MediaStorageKeys,
  PlanEntitlement,
  QueueJob,
  RenderJobStatus,
  RenderWorkflowPlan,
  SubscriptionTier,
  UsageSnapshot,
} from "./types";

export const DEFAULT_RENDER_QUEUE = "content-ops-render";
export const WORKFLOW_SCHEMA_VERSION = "content_ops.render_job.v1";

export const DEFAULT_ENTITLEMENTS: Record<SubscriptionTier, PlanEntitlement> = {
  free: {
    tier: "free",
    maxActiveRenderJobs: 1,
    monthlyRenderMinutes: 30,
    maxSourceBytes: 500 * 1024 * 1024,
    queuePriority: 10,
    stripeLookupKey: "content_ops_free",
  },
  creator: {
    tier: "creator",
    maxActiveRenderJobs: 3,
    monthlyRenderMinutes: 200,
    maxSourceBytes: 2 * 1024 * 1024 * 1024,
    queuePriority: 50,
    stripeLookupKey: "content_ops_creator",
  },
  studio: {
    tier: "studio",
    maxActiveRenderJobs: 10,
    monthlyRenderMinutes: 1_000,
    maxSourceBytes: 10 * 1024 * 1024 * 1024,
    queuePriority: 100,
    stripeLookupKey: "content_ops_studio",
  },
};

export const ALLOWED_RENDER_JOB_TRANSITIONS: Record<RenderJobStatus, readonly RenderJobStatus[]> = {
  created: ["uploaded", "canceled", "failed"],
  uploaded: ["transcribing", "render_queued", "canceled", "failed"],
  transcribing: ["transcribed", "canceled", "failed"],
  transcribed: ["render_queued", "canceled", "failed"],
  render_queued: ["rendering", "canceled", "failed"],
  rendering: ["ready", "failed"],
  ready: [],
  failed: [],
  canceled: [],
};

export function buildStorageKeys(request: Pick<
  CreateRenderJobBody,
  "workspaceId" | "projectId" | "sourceAssetId" | "sourceFilename"
>): MediaStorageKeys {
  const basePrefix = `workspaces/${request.workspaceId}/projects/${request.projectId}`;
  const safeFilename = slugifyFilename(request.sourceFilename);

  return {
    source_key: `${basePrefix}/uploads/${request.sourceAssetId}/${safeFilename}`,
    audio_key: `${basePrefix}/audio/${request.sourceAssetId}/source.wav`,
    transcript_key: `${basePrefix}/transcripts/${request.sourceAssetId}/transcript.json`,
    render_output_prefix: `${basePrefix}/renders/${request.sourceAssetId}/`,
  };
}

export function estimateRenderMinutes(request: Pick<CreateRenderJobBody, "durationSeconds" | "clipCount">): number {
  return Math.ceil(request.durationSeconds / 60) * request.clipCount;
}

export function planRenderWorkflow({
  request,
  tier,
  usage,
  queueName = DEFAULT_RENDER_QUEUE,
}: {
  request: CreateRenderJobBody;
  tier: SubscriptionTier;
  usage: UsageSnapshot;
  queueName?: string;
}): RenderWorkflowPlan {
  const entitlement = DEFAULT_ENTITLEMENTS[tier];
  const storageKeys = buildStorageKeys(request);
  const estimatedRenderMinutes = estimateRenderMinutes(request);

  if (request.sourceSizeBytes > entitlement.maxSourceBytes) {
    return rejectedPlan({
      reason: "source asset exceeds plan upload limit",
      rejectionCode: "plan_limit_exceeded",
      estimatedRenderMinutes,
      storageKeys,
    });
  }

  if (usage.activeRenderJobs >= entitlement.maxActiveRenderJobs) {
    return rejectedPlan({
      reason: "active render job limit reached",
      rejectionCode: "quota_exceeded",
      estimatedRenderMinutes,
      storageKeys,
    });
  }

  if (usage.renderedMinutesThisPeriod + estimatedRenderMinutes > entitlement.monthlyRenderMinutes) {
    return rejectedPlan({
      reason: "monthly render minute quota exceeded",
      rejectionCode: "quota_exceeded",
      estimatedRenderMinutes,
      storageKeys,
    });
  }

  const queueJob: QueueJob = {
    queueName,
    idempotencyKey: buildIdempotencyKey(request),
    priority: entitlement.queuePriority,
    payload: {
      schema_version: WORKFLOW_SCHEMA_VERSION,
      workspace_id: request.workspaceId,
      project_id: request.projectId,
      user_id: request.userId,
      source_asset_id: request.sourceAssetId,
      subscription_tier: tier,
      storage: storageKeys,
      render: {
        brand_name: request.brandName,
        audience: request.audience,
        clip_count: request.clipCount,
        platforms: normalizedPlatforms(request.platforms),
        estimated_minutes: estimatedRenderMinutes,
      },
    },
  };

  return {
    accepted: true,
    nextStatus: "render_queued",
    estimatedRenderMinutes,
    storageKeys,
    queueJob,
  };
}

export function canTransitionRenderJob(current: RenderJobStatus, nextStatus: RenderJobStatus): boolean {
  return nextStatus === current || ALLOWED_RENDER_JOB_TRANSITIONS[current].includes(nextStatus);
}

export function transitionRenderJobStatus(current: RenderJobStatus, nextStatus: RenderJobStatus): RenderJobStatus {
  if (canTransitionRenderJob(current, nextStatus)) {
    return nextStatus;
  }

  throw new Error(`invalid render job transition: ${current} -> ${nextStatus}`);
}

export function normalizedPlatforms(platforms: readonly string[]): string[] {
  return [...new Set(platforms.map((platform) => platform.trim().toLowerCase()))].sort();
}

function rejectedPlan({
  reason,
  rejectionCode,
  estimatedRenderMinutes,
  storageKeys,
}: {
  reason: string;
  rejectionCode: "quota_exceeded" | "plan_limit_exceeded";
  estimatedRenderMinutes: number;
  storageKeys: MediaStorageKeys;
}): RenderWorkflowPlan {
  return {
    accepted: false,
    reason,
    rejectionCode,
    nextStatus: "created",
    estimatedRenderMinutes,
    storageKeys,
  };
}

function buildIdempotencyKey(request: CreateRenderJobBody): string {
  return [
    "render",
    request.workspaceId,
    request.projectId,
    request.sourceAssetId,
    String(request.clipCount),
    normalizedPlatforms(request.platforms).join(","),
  ].join(":");
}

function slugifyFilename(value: string): string {
  const normalized = value.trim().replace(/[\\/]/g, " ").toLowerCase();
  const slug = normalized.replace(/[^a-z0-9.]+/g, "-").replace(/^[.-]+|[.-]+$/g, "");
  return slug || "source";
}
