import type { ApiErrorDetail } from "../api-response";
import type {
  ActiveEditBriefLookupRequest,
  EditBriefReadModel,
  EditBriefSettings,
} from "../edit-briefs/types";

export const RENDER_JOB_STATUSES = [
  "created",
  "uploaded",
  "transcribing",
  "transcribed",
  "render_queued",
  "rendering",
  "ready",
  "failed",
  "canceled",
] as const;

export const SUBSCRIPTION_TIERS = ["free", "creator", "studio"] as const;

export type RenderJobStatus = (typeof RENDER_JOB_STATUSES)[number];
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export interface PlanEntitlement {
  tier: SubscriptionTier;
  maxActiveRenderJobs: number;
  monthlyRenderMinutes: number;
  maxSourceBytes: number;
  queuePriority: number;
  stripeLookupKey: string;
}

export interface UsageSnapshot {
  activeRenderJobs: number;
  renderedMinutesThisPeriod: number;
}

export interface WorkspaceSubscription {
  tier: SubscriptionTier;
}

export interface CreateRenderJobBody {
  workspaceId: string;
  projectId: string;
  userId: string;
  sourceAssetId: string;
  sourceFilename: string;
  sourceSizeBytes: number;
  durationSeconds: number;
  brandName: string;
  audience: string;
  clipCount: number;
  platforms: string[];
  templateVariant: string;
  templateParameters: RenderTemplateParameters;
  styleOptions: RenderStyleOptions;
  captionTimeline: RenderCaptionCue[];
  editBrief?: RenderEditBriefReference;
}

export interface RenderEditBriefReference {
  id: string;
  versionId: string;
  versionNumber: number;
  settings: EditBriefSettings;
}

export type RenderTemplateParameterValue = string | number | boolean;

export type RenderTemplateParameters = Record<string, RenderTemplateParameterValue>;

export type CaptionPosition = "top" | "center" | "bottom";

export type OverlayPosition = "top" | "center" | "bottom" | "left" | "right";

export interface RenderStyleOptions {
  fontFamily: string;
  brandColor: string;
  accentColor?: string;
  captionPosition: CaptionPosition;
  overlayPosition: OverlayPosition;
}

export interface RenderCaptionCue {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
}

export interface MediaStorageKeys {
  source_key: string;
  audio_key: string;
  transcript_key: string;
  render_output_prefix: string;
}

export interface QueueJobPayload {
  schema_version: "content_ops.render_job.v1";
  workspace_id: string;
  project_id: string;
  user_id: string;
  source_asset_id: string;
  subscription_tier: SubscriptionTier;
  storage: MediaStorageKeys;
  render: {
    render_engine: "hyperframes";
    brand_name: string;
    audience: string;
    clip_count: number;
    platforms: string[];
    estimated_minutes: number;
    template: {
      variant: string;
      parameters: Record<string, RenderTemplateParameterValue>;
    };
    style_options: {
      font_family: string;
      brand_color: string;
      accent_color?: string;
      caption_position: CaptionPosition;
      overlay_position: OverlayPosition;
    };
    caption_timeline: Array<{
      start_ms: number;
      end_ms: number;
      text: string;
      speaker?: string;
    }>;
    source_assets: Array<{
      role: "primary_video";
      asset_id: string;
      storage_key: string;
    }>;
    composition: {
      aspect_ratio: "9:16";
      width: 1080;
      height: 1920;
      fps: 30;
    };
    output_settings: {
      format: "mp4";
      video_codec: "h264";
      audio_codec: "aac";
    };
    edit_brief?: {
      id: string;
      version_id: string;
      version_number: number;
      settings: {
        schema_version: "content_ops.edit_brief.v1";
        goal: string;
        tone: EditBriefSettings["tone"];
        pacing: EditBriefSettings["pacing"];
        target_platforms: EditBriefSettings["targetPlatforms"];
        include: EditBriefSettings["include"];
        exclude: EditBriefSettings["exclude"];
        clip_length_seconds: EditBriefSettings["clipLengthSeconds"];
        caption_style: EditBriefSettings["captionStyle"];
        crop_strategy: EditBriefSettings["cropStrategy"];
        music: {
          mood: EditBriefSettings["music"]["mood"];
          allow_licensed: boolean;
        };
        editorial_rules: EditBriefSettings["editorialRules"];
      };
    };
  };
}

export interface QueueJob {
  queueName: string;
  idempotencyKey: string;
  priority: number;
  payload: QueueJobPayload;
}

export interface RenderJobRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  userId: string;
  sourceAssetId: string;
  status: RenderJobStatus;
  estimatedRenderMinutes: number;
  storageKeys: MediaStorageKeys;
  queueJob: QueueJob;
  outputManifest?: RenderOutputManifest;
}

export interface RenderOutputManifest {
  outputs: RenderOutputAsset[];
}

export interface RenderOutputAsset {
  id: string;
  storageKey: string;
  filename: string;
  contentType: string;
  durationSeconds?: number;
  sizeBytes?: number;
}

export interface DownloadTarget {
  method: "GET";
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface SignedRenderOutput extends RenderOutputAsset {
  download: DownloadTarget;
}

export interface RenderJobReadModel extends RenderJobRecord {
  outputs: SignedRenderOutput[];
}

export interface RenderWorkflowPlan {
  accepted: boolean;
  reason?: string;
  rejectionCode?: "quota_exceeded" | "plan_limit_exceeded";
  nextStatus: RenderJobStatus;
  estimatedRenderMinutes: number;
  storageKeys: MediaStorageKeys;
  queueJob?: QueueJob;
}

export interface RenderJobRepository {
  getWorkspaceSubscription(workspaceId: string): Promise<WorkspaceSubscription>;
  getUsageSnapshot(workspaceId: string): Promise<UsageSnapshot>;
  createRenderJob(record: RenderJobRecord): Promise<RenderJobRecord>;
  getRenderJobById(id: string): Promise<RenderJobRecord | undefined>;
}

export interface ActiveEditBriefRepository {
  getActiveEditBrief(request: ActiveEditBriefLookupRequest): Promise<EditBriefReadModel | undefined>;
}

export interface RenderQueue {
  enqueue(job: QueueJob): Promise<void>;
}

export interface DownloadSignerRequest {
  key: string;
  responseContentType: string;
  responseContentDisposition: string;
  expiresAt: Date;
}

export interface DownloadSigner {
  presignDownload(request: DownloadSignerRequest): Promise<DownloadTarget>;
}

export interface CreateRenderJobDependencies {
  repository: RenderJobRepository;
  queue: RenderQueue;
  activeEditBriefRepository?: ActiveEditBriefRepository;
  outputSigner?: DownloadSigner;
  now?: () => Date;
  outputDownloadTtlSeconds?: number;
}

export interface CreateRenderJobResult {
  renderJob: RenderJobRecord;
  queueJob: QueueJob;
}

export interface ValidationResult<TValue> {
  ok: boolean;
  value?: TValue;
  details?: ApiErrorDetail[];
}
