import type { ProductAnalyticsSink } from "../analytics/types";
import type { ApiErrorDetail } from "../api-response";

export const EDIT_BRIEF_SCHEMA_VERSION = "content_ops.edit_brief.v1";

export const EDIT_BRIEF_TONES = [
  "educational",
  "funny",
  "authoritative",
  "casual",
  "dramatic",
  "inspirational",
] as const;

export const EDIT_BRIEF_PACING = ["slow", "balanced", "fast", "very_fast"] as const;

export const EDIT_BRIEF_PLATFORMS = [
  "instagram_reels",
  "linkedin",
  "tiktok",
  "x",
  "youtube_shorts",
] as const;

export const CAPTION_STYLE_PRESETS = ["minimal", "bold", "karaoke", "subtitle"] as const;
export const CAPTION_DENSITIES = ["low", "medium", "high"] as const;
export const CROP_STRATEGIES = [
  "auto_subject",
  "center_crop",
  "manual_review",
  "screen_recording",
  "speaker_focus",
] as const;
export const MUSIC_MOODS = ["none", "upbeat", "calm", "dramatic", "lofi"] as const;

export type EditBriefTone = (typeof EDIT_BRIEF_TONES)[number];
export type EditBriefPacing = (typeof EDIT_BRIEF_PACING)[number];
export type EditBriefPlatform = (typeof EDIT_BRIEF_PLATFORMS)[number];
export type CaptionStylePreset = (typeof CAPTION_STYLE_PRESETS)[number];
export type CaptionDensity = (typeof CAPTION_DENSITIES)[number];
export type CropStrategy = (typeof CROP_STRATEGIES)[number];
export type MusicMood = (typeof MUSIC_MOODS)[number];

export interface CreateEditBriefBody {
  workspaceId: string;
  projectId: string;
  userId: string;
  sourceAssetId?: string;
  chatMessage?: string;
  goal?: string;
  tone?: EditBriefTone;
  pacing?: EditBriefPacing;
  targetPlatforms?: EditBriefPlatform[];
  include?: EditMomentConstraint[];
  exclude?: EditMomentConstraint[];
  clipLengthSeconds?: ClipLengthSeconds;
  captionStyle?: Partial<CaptionStyle>;
  cropStrategy?: CropStrategy;
  music?: Partial<MusicSettings>;
  editorialRules?: string[];
}

export interface EditMomentConstraint {
  label: string;
  startMs?: number;
  endMs?: number;
  reason?: string;
}

export interface ClipLengthSeconds {
  min: number;
  max: number;
}

export interface CaptionStyle {
  preset: CaptionStylePreset;
  density: CaptionDensity;
  emoji: boolean;
}

export interface MusicSettings {
  mood: MusicMood;
  allowLicensed: boolean;
}

export interface EditBriefSettings {
  schemaVersion: typeof EDIT_BRIEF_SCHEMA_VERSION;
  goal: string;
  tone: EditBriefTone;
  pacing: EditBriefPacing;
  targetPlatforms: EditBriefPlatform[];
  include: EditMomentConstraint[];
  exclude: EditMomentConstraint[];
  clipLengthSeconds: ClipLengthSeconds;
  captionStyle: CaptionStyle;
  cropStrategy: CropStrategy;
  music: MusicSettings;
  editorialRules: string[];
}

export interface EditBriefVersionRecord {
  id: string;
  editBriefId: string;
  workspaceId: string;
  projectId: string;
  userId: string;
  sourceAssetId?: string;
  versionNumber: number;
  settings: EditBriefSettings;
  idempotencyKey: string;
}

export interface CreateEditBriefResult {
  editBrief: EditBriefReadModel;
}

export interface EditBriefReadModel {
  id: string;
  versionId: string;
  workspaceId: string;
  projectId: string;
  userId: string;
  sourceAssetId?: string;
  versionNumber: number;
  settings: EditBriefSettings;
}

export interface ActiveEditBriefLookupRequest {
  workspaceId: string;
  projectId: string;
  sourceAssetId?: string;
}

export interface EditBriefRepository {
  createEditBriefVersion(record: EditBriefVersionRecord): Promise<EditBriefVersionRecord>;
  getActiveEditBrief?(request: ActiveEditBriefLookupRequest): Promise<EditBriefReadModel | undefined>;
}

export interface CreateEditBriefDependencies {
  editBriefRepository: EditBriefRepository;
  analyticsSink?: ProductAnalyticsSink;
  now?: () => Date;
}

export interface ValidationResult<TValue> {
  ok: boolean;
  value?: TValue;
  details?: ApiErrorDetail[];
}
