import { createHash } from "node:crypto";

import {
  EDIT_BRIEF_SCHEMA_VERSION,
  type CreateEditBriefBody,
  type EditBriefSettings,
  type EditMomentConstraint,
} from "./types";

export const DEFAULT_EDIT_BRIEF_SETTINGS: EditBriefSettings = {
  schemaVersion: EDIT_BRIEF_SCHEMA_VERSION,
  goal: "Create short-form clips from the uploaded source.",
  tone: "educational",
  pacing: "balanced",
  targetPlatforms: ["instagram_reels", "tiktok", "youtube_shorts"],
  include: [],
  exclude: [],
  clipLengthSeconds: {
    min: 20,
    max: 45,
  },
  captionStyle: {
    preset: "bold",
    density: "medium",
    emoji: false,
  },
  cropStrategy: "auto_subject",
  music: {
    mood: "none",
    allowLicensed: false,
  },
  editorialRules: [],
};

export function buildEditBriefSettings(request: CreateEditBriefBody): EditBriefSettings {
  const chatSettings = extractSettingsFromChatMessage(request.chatMessage);

  return {
    schemaVersion: EDIT_BRIEF_SCHEMA_VERSION,
    goal: normalizeText(request.goal ?? chatSettings.goal ?? DEFAULT_EDIT_BRIEF_SETTINGS.goal),
    tone: request.tone ?? chatSettings.tone ?? DEFAULT_EDIT_BRIEF_SETTINGS.tone,
    pacing: request.pacing ?? chatSettings.pacing ?? DEFAULT_EDIT_BRIEF_SETTINGS.pacing,
    targetPlatforms: request.targetPlatforms
      ? normalizedPlatforms(request.targetPlatforms)
      : chatSettings.targetPlatforms ?? [...DEFAULT_EDIT_BRIEF_SETTINGS.targetPlatforms],
    include: normalizeMomentConstraints(request.include ?? chatSettings.include ?? []),
    exclude: normalizeMomentConstraints(request.exclude ?? chatSettings.exclude ?? []),
    clipLengthSeconds: {
      min: request.clipLengthSeconds?.min ?? chatSettings.clipLengthSeconds?.min ?? DEFAULT_EDIT_BRIEF_SETTINGS.clipLengthSeconds.min,
      max: request.clipLengthSeconds?.max ?? chatSettings.clipLengthSeconds?.max ?? DEFAULT_EDIT_BRIEF_SETTINGS.clipLengthSeconds.max,
    },
    captionStyle: {
      preset: request.captionStyle?.preset ?? chatSettings.captionStyle?.preset ?? DEFAULT_EDIT_BRIEF_SETTINGS.captionStyle.preset,
      density: request.captionStyle?.density ?? chatSettings.captionStyle?.density ?? DEFAULT_EDIT_BRIEF_SETTINGS.captionStyle.density,
      emoji: request.captionStyle?.emoji ?? chatSettings.captionStyle?.emoji ?? DEFAULT_EDIT_BRIEF_SETTINGS.captionStyle.emoji,
    },
    cropStrategy: request.cropStrategy ?? chatSettings.cropStrategy ?? DEFAULT_EDIT_BRIEF_SETTINGS.cropStrategy,
    music: {
      mood: request.music?.mood ?? chatSettings.music?.mood ?? DEFAULT_EDIT_BRIEF_SETTINGS.music.mood,
      allowLicensed: request.music?.allowLicensed ?? chatSettings.music?.allowLicensed ?? DEFAULT_EDIT_BRIEF_SETTINGS.music.allowLicensed,
    },
    editorialRules: (request.editorialRules ?? chatSettings.editorialRules ?? []).map(normalizeText),
  };
}

export function buildEditBriefId(request: Pick<
  CreateEditBriefBody,
  "workspaceId" | "projectId" | "sourceAssetId"
>): string {
  return [
    "edit_brief",
    slugifyIdSegment(request.workspaceId),
    slugifyIdSegment(request.projectId),
    slugifyIdSegment(request.sourceAssetId ?? "project"),
  ].join("_");
}

export function buildEditBriefVersionId({
  editBriefId,
  settings,
}: {
  editBriefId: string;
  settings: EditBriefSettings;
}): string {
  return [
    "edit_brief_version",
    editBriefId,
    buildEditBriefFingerprint(settings),
  ].join("_");
}

export function buildEditBriefIdempotencyKey({
  editBriefId,
  settings,
}: {
  editBriefId: string;
  settings: EditBriefSettings;
}): string {
  return ["edit-brief", editBriefId, buildEditBriefFingerprint(settings)].join(":");
}

export function buildEditBriefFingerprint(settings: EditBriefSettings): string {
  return createHash("sha256")
    .update(stableStringify(settings))
    .digest("hex")
    .slice(0, 12);
}

export function normalizedPlatforms(platforms: readonly string[]): EditBriefSettings["targetPlatforms"] {
  return [...new Set(platforms.map((platform) => platform.trim().toLowerCase()))].sort() as EditBriefSettings[
    "targetPlatforms"
  ];
}

function extractSettingsFromChatMessage(chatMessage: string | undefined): Partial<CreateEditBriefBody> {
  const message = chatMessage?.trim();

  if (!message) {
    return {};
  }

  const lowerMessage = message.toLowerCase();
  return {
    ...extractTone(lowerMessage),
    ...extractPacing(lowerMessage),
    ...extractPlatforms(lowerMessage),
    ...extractMomentLists(lowerMessage),
    ...extractClipLength(lowerMessage),
    ...extractCaptionStyle(lowerMessage),
    ...extractCropStrategy(lowerMessage),
    ...extractMusic(lowerMessage),
  };
}

function extractTone(message: string): Pick<CreateEditBriefBody, "tone"> {
  if (/\b(funny|humor|humorous|comedic|joke)\b/.test(message)) {
    return { tone: "funny" };
  }
  if (/\b(authoritative|expert|confident)\b/.test(message)) {
    return { tone: "authoritative" };
  }
  if (/\b(casual|relaxed|conversational)\b/.test(message)) {
    return { tone: "casual" };
  }
  if (/\b(dramatic|intense|cinematic)\b/.test(message)) {
    return { tone: "dramatic" };
  }
  if (/\b(inspirational|motivational)\b/.test(message)) {
    return { tone: "inspirational" };
  }
  if (/\b(educational|teach|explainer|tutorial)\b/.test(message)) {
    return { tone: "educational" };
  }
  return {};
}

function extractPacing(message: string): Pick<CreateEditBriefBody, "pacing"> {
  if (/\b(very fast|rapid|super fast|quick cuts)\b/.test(message)) {
    return { pacing: "very_fast" };
  }
  if (/\b(fast|fast-paced|punchy|tight)\b/.test(message)) {
    return { pacing: "fast" };
  }
  if (/\b(slow|slower|calm pace)\b/.test(message)) {
    return { pacing: "slow" };
  }
  return {};
}

function extractPlatforms(message: string): Pick<CreateEditBriefBody, "targetPlatforms"> {
  const platforms: CreateEditBriefBody["targetPlatforms"] = [];

  if (/\btiktok\b/.test(message)) {
    platforms.push("tiktok");
  }
  if (/\b(linkedin|linked in)\b/.test(message)) {
    platforms.push("linkedin");
  }
  if (/\b(reels|instagram)\b/.test(message)) {
    platforms.push("instagram_reels");
  }
  if (/\b(youtube shorts|shorts)\b/.test(message)) {
    platforms.push("youtube_shorts");
  }
  if (/\b(x|twitter)\b/.test(message)) {
    platforms.push("x");
  }

  return platforms.length > 0 ? { targetPlatforms: normalizedPlatforms(platforms) } : {};
}

function extractMomentLists(message: string): Pick<CreateEditBriefBody, "include" | "exclude"> {
  return {
    ...extractMomentList(message, "include"),
    ...extractMomentList(message, "exclude"),
  };
}

function extractMomentList(
  message: string,
  type: "include" | "exclude",
): Pick<CreateEditBriefBody, "include" | "exclude"> {
  const verbPattern = type === "include" ? "(?:keep|include|use|feature)" : "(?:remove|exclude|cut|skip)";
  const match = new RegExp(`${verbPattern}\\s+([^,.]+)`, "i").exec(message);

  if (!match) {
    return {};
  }

  const label = match[1]?.replace(/\b(and|with|but)$/i, "").trim();

  if (!label) {
    return {};
  }

  return {
    [type]: [{ label }],
  };
}

function extractClipLength(message: string): Pick<CreateEditBriefBody, "clipLengthSeconds"> {
  const rangeMatch = /\b(\d{1,3})\s*[-–]\s*(\d{1,3})\s*(?:s|sec|secs|seconds)?\b/.exec(message);

  if (rangeMatch) {
    return {
      clipLengthSeconds: {
        min: Number(rangeMatch[1]),
        max: Number(rangeMatch[2]),
      },
    };
  }

  return {};
}

function extractCaptionStyle(message: string): Pick<CreateEditBriefBody, "captionStyle"> {
  if (/\bkaraoke captions?\b/.test(message)) {
    return { captionStyle: { preset: "karaoke" } };
  }
  if (/\bbold captions?\b/.test(message)) {
    return { captionStyle: { preset: "bold" } };
  }
  if (/\bminimal captions?\b/.test(message)) {
    return { captionStyle: { preset: "minimal" } };
  }
  if (/\bsubtitles?\b/.test(message)) {
    return { captionStyle: { preset: "subtitle" } };
  }
  return {};
}

function extractCropStrategy(message: string): Pick<CreateEditBriefBody, "cropStrategy"> {
  if (/\b(screen|demo|walkthrough)\b/.test(message)) {
    return { cropStrategy: "screen_recording" };
  }
  if (/\b(speaker|talking head|face)\b/.test(message)) {
    return { cropStrategy: "speaker_focus" };
  }
  return {};
}

function extractMusic(message: string): Pick<CreateEditBriefBody, "music"> {
  if (/\b(upbeat music|upbeat)\b/.test(message)) {
    return { music: { mood: "upbeat" } };
  }
  if (/\b(calm music|calm)\b/.test(message)) {
    return { music: { mood: "calm" } };
  }
  if (/\b(dramatic music|dramatic)\b/.test(message)) {
    return { music: { mood: "dramatic" } };
  }
  if (/\b(lofi|lo-fi)\b/.test(message)) {
    return { music: { mood: "lofi" } };
  }
  if (/\b(no music|without music)\b/.test(message)) {
    return { music: { mood: "none" } };
  }
  return {};
}

function normalizeMomentConstraints(
  constraints: readonly EditMomentConstraint[],
): EditMomentConstraint[] {
  return constraints.map((constraint) => ({
    label: normalizeText(constraint.label),
    ...(constraint.startMs !== undefined ? { startMs: constraint.startMs } : {}),
    ...(constraint.endMs !== undefined ? { endMs: constraint.endMs } : {}),
    ...(constraint.reason !== undefined ? { reason: normalizeText(constraint.reason) } : {}),
  }));
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function slugifyIdSegment(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "default";
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
