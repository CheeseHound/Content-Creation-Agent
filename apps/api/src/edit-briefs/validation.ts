import type { ApiErrorDetail } from "../api-response";
import {
  CAPTION_DENSITIES,
  CAPTION_STYLE_PRESETS,
  CROP_STRATEGIES,
  EDIT_BRIEF_PACING,
  EDIT_BRIEF_PLATFORMS,
  EDIT_BRIEF_TONES,
  MUSIC_MOODS,
  type CreateEditBriefBody,
  type CropStrategy,
  type EditBriefPacing,
  type EditBriefPlatform,
  type EditBriefTone,
  type ValidationResult,
} from "./types";

const ID_FIELDS = ["workspaceId", "projectId", "userId"] as const;
const MAX_GOAL_LENGTH = 1_000;
const MAX_CHAT_MESSAGE_LENGTH = 2_000;
const MAX_RULE_LENGTH = 500;
const MAX_MOMENT_LABEL_LENGTH = 240;
const MAX_MOMENT_REASON_LENGTH = 500;
const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const UNSAFE_TEXT_PATTERN = /[\u0000-\u001f\u007f]|javascript:|data:|https?:\/\/|[`$<>]/i;
const SECRET_TEXT_PATTERN = /\b(api[_ -]?key|secret[_ -]?access[_ -]?key|secret|password|token)\b|sk-[a-z0-9_-]{8,}/i;

export function validateCreateEditBriefBody(body: unknown): ValidationResult<CreateEditBriefBody> {
  if (!isRecord(body)) {
    return {
      ok: false,
      details: [
        {
          field: "body",
          code: "invalid_type",
          message: "Request body must be a JSON object.",
        },
      ],
    };
  }

  const details = [
    ...ID_FIELDS.flatMap((field) => validateIdField(body, field)),
    ...validateOptionalIdField(body, "sourceAssetId"),
    ...validateOptionalChatMessage(body.chatMessage),
    ...validateOptionalText(body.goal, "goal", MAX_GOAL_LENGTH),
    ...validateOptionalEnum(body.tone, "tone", EDIT_BRIEF_TONES),
    ...validateOptionalEnum(body.pacing, "pacing", EDIT_BRIEF_PACING),
    ...validateTargetPlatforms(body.targetPlatforms),
    ...validateMomentList(body.include, "include"),
    ...validateMomentList(body.exclude, "exclude"),
    ...validateClipLengthSeconds(body.clipLengthSeconds),
    ...validateCaptionStyle(body.captionStyle),
    ...validateOptionalEnum(body.cropStrategy, "cropStrategy", CROP_STRATEGIES),
    ...validateMusic(body.music),
    ...validateEditorialRules(body.editorialRules),
  ];

  if (details.length > 0) {
    return {
      ok: false,
      details,
    };
  }

  return {
    ok: true,
    value: {
      workspaceId: body.workspaceId as string,
      projectId: body.projectId as string,
      userId: body.userId as string,
      ...(body.sourceAssetId !== undefined ? { sourceAssetId: body.sourceAssetId as string } : {}),
      ...(body.chatMessage !== undefined ? { chatMessage: body.chatMessage as string } : {}),
      ...(body.goal !== undefined ? { goal: body.goal as string } : {}),
      ...(body.tone !== undefined ? { tone: body.tone as EditBriefTone } : {}),
      ...(body.pacing !== undefined ? { pacing: body.pacing as EditBriefPacing } : {}),
      ...(body.targetPlatforms !== undefined ? { targetPlatforms: body.targetPlatforms as EditBriefPlatform[] } : {}),
      ...(body.include !== undefined ? { include: body.include as CreateEditBriefBody["include"] } : {}),
      ...(body.exclude !== undefined ? { exclude: body.exclude as CreateEditBriefBody["exclude"] } : {}),
      ...(body.clipLengthSeconds !== undefined
        ? { clipLengthSeconds: body.clipLengthSeconds as CreateEditBriefBody["clipLengthSeconds"] }
        : {}),
      ...(body.captionStyle !== undefined ? { captionStyle: body.captionStyle as CreateEditBriefBody["captionStyle"] } : {}),
      ...(body.cropStrategy !== undefined ? { cropStrategy: body.cropStrategy as CropStrategy } : {}),
      ...(body.music !== undefined ? { music: body.music as CreateEditBriefBody["music"] } : {}),
      ...(body.editorialRules !== undefined ? { editorialRules: body.editorialRules as string[] } : {}),
    },
  };
}

function validateOptionalChatMessage(value: unknown): ApiErrorDetail[] {
  if (value === undefined) {
    return [];
  }

  if (typeof value !== "string") {
    return [
      {
        field: "chatMessage",
        code: "invalid_type",
        message: "chatMessage must be a string.",
      },
    ];
  }

  if (value.trim().length === 0) {
    return [];
  }

  if (!isSafeText(value, MAX_CHAT_MESSAGE_LENGTH)) {
    return [
      {
        field: "chatMessage",
        code: "unsafe_text",
        message: `chatMessage must be safe text under ${MAX_CHAT_MESSAGE_LENGTH} characters.`,
      },
    ];
  }

  return [];
}

function validateIdField(body: Record<string, unknown>, field: string): ApiErrorDetail[] {
  const value = body[field];

  if (typeof value !== "string" || !SAFE_ID_PATTERN.test(value.trim())) {
    return [
      {
        field,
        code: "invalid_id",
        message: `${field} must be a safe non-empty identifier.`,
      },
    ];
  }

  return [];
}

function validateOptionalIdField(body: Record<string, unknown>, field: string): ApiErrorDetail[] {
  return body[field] === undefined ? [] : validateIdField(body, field);
}

function validateOptionalText(value: unknown, field: string, maxLength: number): ApiErrorDetail[] {
  if (value === undefined) {
    return [];
  }

  if (typeof value !== "string" || !isSafeText(value, maxLength)) {
    return [
      {
        field,
        code: "unsafe_text",
        message: `${field} must be safe text under ${maxLength} characters.`,
      },
    ];
  }

  return [];
}

function validateOptionalEnum<TValue extends string>(
  value: unknown,
  field: string,
  allowedValues: readonly TValue[],
): ApiErrorDetail[] {
  if (value === undefined) {
    return [];
  }

  if (typeof value !== "string" || !allowedValues.includes(value as TValue)) {
    return [
      {
        field,
        code: "unsupported_value",
        message: `${field} is not supported.`,
      },
    ];
  }

  return [];
}

function validateTargetPlatforms(value: unknown): ApiErrorDetail[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length === 0 || value.length > 5) {
    return [
      {
        field: "targetPlatforms",
        code: "invalid_array",
        message: "targetPlatforms must include one to five supported platforms.",
      },
    ];
  }

  const invalidIndex = value.findIndex((platform) =>
    typeof platform !== "string" || !EDIT_BRIEF_PLATFORMS.includes(platform as EditBriefPlatform),
  );

  if (invalidIndex >= 0) {
    return [
      {
        field: `targetPlatforms[${invalidIndex}]`,
        code: "unsupported_platform",
        message: "targetPlatforms can only include supported platform values.",
      },
    ];
  }

  return [];
}

function validateMomentList(value: unknown, field: "include" | "exclude"): ApiErrorDetail[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length > 25) {
    return [
      {
        field,
        code: "invalid_array",
        message: `${field} must be an array with at most 25 items.`,
      },
    ];
  }

  return value.flatMap((entry, index) => validateMoment(entry, `${field}[${index}]`));
}

function validateMoment(value: unknown, field: string): ApiErrorDetail[] {
  if (!isRecord(value)) {
    return [
      {
        field,
        code: "invalid_type",
        message: "Moment constraints must be objects.",
      },
    ];
  }

  const details = [
    ...validateRequiredText(value.label, `${field}.label`, MAX_MOMENT_LABEL_LENGTH),
    ...validateOptionalText(value.reason, `${field}.reason`, MAX_MOMENT_REASON_LENGTH),
  ];

  if (value.startMs !== undefined && (!Number.isInteger(value.startMs) || Number(value.startMs) < 0)) {
    details.push({
      field: `${field}.startMs`,
      code: "invalid_timestamp",
      message: "startMs must be a non-negative integer.",
    });
  }

  if (value.endMs !== undefined && (!Number.isInteger(value.endMs) || Number(value.endMs) < 1)) {
    details.push({
      field: `${field}.endMs`,
      code: "invalid_timestamp",
      message: "endMs must be a positive integer.",
    });
  }

  if (
    Number.isInteger(value.startMs) &&
    Number.isInteger(value.endMs) &&
    Number(value.endMs) <= Number(value.startMs)
  ) {
    details.push({
      field,
      code: "invalid_range",
      message: "Moment endMs must be after startMs.",
    });
  }

  return details;
}

function validateRequiredText(value: unknown, field: string, maxLength: number): ApiErrorDetail[] {
  if (typeof value !== "string" || !isSafeText(value, maxLength)) {
    return [
      {
        field,
        code: "unsafe_text",
        message: `${field} must be safe text under ${maxLength} characters.`,
      },
    ];
  }

  return [];
}

function validateClipLengthSeconds(value: unknown): ApiErrorDetail[] {
  if (value === undefined) {
    return [];
  }

  if (!isRecord(value)) {
    return [
      {
        field: "clipLengthSeconds",
        code: "invalid_type",
        message: "clipLengthSeconds must be an object.",
      },
    ];
  }

  if (
    !Number.isInteger(value.min) ||
    !Number.isInteger(value.max) ||
    Number(value.min) < 5 ||
    Number(value.max) > 180 ||
    Number(value.max) < Number(value.min)
  ) {
    return [
      {
        field: "clipLengthSeconds",
        code: "invalid_range",
        message: "clipLengthSeconds must define a 5 to 180 second range.",
      },
    ];
  }

  return [];
}

function validateCaptionStyle(value: unknown): ApiErrorDetail[] {
  if (value === undefined) {
    return [];
  }

  if (!isRecord(value)) {
    return [
      {
        field: "captionStyle",
        code: "invalid_type",
        message: "captionStyle must be an object.",
      },
    ];
  }

  return [
    ...validateOptionalEnum(value.preset, "captionStyle.preset", CAPTION_STYLE_PRESETS),
    ...validateOptionalEnum(value.density, "captionStyle.density", CAPTION_DENSITIES),
    ...(value.emoji === undefined || typeof value.emoji === "boolean"
      ? []
      : [
          {
            field: "captionStyle.emoji",
            code: "invalid_boolean",
            message: "captionStyle.emoji must be a boolean.",
          },
        ]),
  ];
}

function validateMusic(value: unknown): ApiErrorDetail[] {
  if (value === undefined) {
    return [];
  }

  if (!isRecord(value)) {
    return [
      {
        field: "music",
        code: "invalid_type",
        message: "music must be an object.",
      },
    ];
  }

  return [
    ...validateOptionalEnum(value.mood, "music.mood", MUSIC_MOODS),
    ...(value.allowLicensed === undefined || typeof value.allowLicensed === "boolean"
      ? []
      : [
          {
            field: "music.allowLicensed",
            code: "invalid_boolean",
            message: "music.allowLicensed must be a boolean.",
          },
        ]),
  ];
}

function validateEditorialRules(value: unknown): ApiErrorDetail[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length > 25) {
    return [
      {
        field: "editorialRules",
        code: "invalid_array",
        message: "editorialRules must be an array with at most 25 items.",
      },
    ];
  }

  return value.flatMap((rule, index) =>
    validateRequiredText(rule, `editorialRules[${index}]`, MAX_RULE_LENGTH),
  );
}

function isSafeText(value: string, maxLength: number): boolean {
  const normalized = value.trim();

  if (normalized.length === 0 || normalized.length > maxLength) {
    return false;
  }

  return !UNSAFE_TEXT_PATTERN.test(normalized) && !SECRET_TEXT_PATTERN.test(normalized);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
