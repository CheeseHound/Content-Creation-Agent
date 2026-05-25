import { createHash } from "node:crypto";

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
        render_engine: "hyperframes",
        brand_name: request.brandName,
        audience: request.audience,
        clip_count: request.clipCount,
        platforms: normalizedPlatforms(request.platforms),
        estimated_minutes: estimatedRenderMinutes,
        template: {
          variant: request.templateVariant,
          parameters: normalizeTemplateParameters(request.templateParameters),
        },
        style_options: {
          font_family: request.styleOptions.fontFamily,
          brand_color: request.styleOptions.brandColor,
          ...(request.styleOptions.accentColor ? { accent_color: request.styleOptions.accentColor } : {}),
          caption_position: request.styleOptions.captionPosition,
          overlay_position: request.styleOptions.overlayPosition,
        },
        caption_timeline: request.captionTimeline.map((cue) => ({
          start_ms: cue.startMs,
          end_ms: cue.endMs,
          text: cue.text,
          ...(cue.speaker ? { speaker: cue.speaker } : {}),
        })),
        source_assets: [
          {
            role: "primary_video",
            asset_id: request.sourceAssetId,
            storage_key: storageKeys.source_key,
          },
        ],
        composition: {
          aspect_ratio: "9:16",
          width: 1080,
          height: 1920,
          fps: 30,
        },
        output_settings: {
          format: "mp4",
          video_codec: "h264",
          audio_codec: "aac",
        },
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
    request.templateVariant,
    buildRenderIntentFingerprint(request),
  ].join(":");
}

export function buildRenderIntentFingerprint(request: Pick<
  CreateRenderJobBody,
  "templateVariant" | "templateParameters" | "styleOptions" | "captionTimeline"
>): string {
  return createHash("sha256")
    .update(stableStringify({
      captionTimeline: request.captionTimeline,
      styleOptions: request.styleOptions,
      templateParameters: request.templateParameters,
      templateVariant: request.templateVariant,
    }))
    .digest("hex")
    .slice(0, 12);
}

function slugifyFilename(value: string): string {
  const normalized = value.trim().replace(/[\\/]/g, " ").toLowerCase();
  const slug = normalized.replace(/[^a-z0-9.]+/g, "-").replace(/^[.-]+|[.-]+$/g, "");
  return slug || "source";
}

function normalizeTemplateParameters(
  parameters: CreateRenderJobBody["templateParameters"],
): CreateRenderJobBody["templateParameters"] {
  return Object.fromEntries(
    Object.entries(parameters)
      .map(([key, value]) => [toSnakeCase(key), value] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function toSnakeCase(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
