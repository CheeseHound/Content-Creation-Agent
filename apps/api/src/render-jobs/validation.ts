import type { ApiErrorDetail } from "../api-response";
import {
  CAPTION_DENSITIES,
  CAPTION_STYLE_PRESETS,
  CROP_STRATEGIES,
  EDIT_BRIEF_PACING,
  EDIT_BRIEF_PLATFORMS,
  EDIT_BRIEF_SCHEMA_VERSION,
  EDIT_BRIEF_TONES,
  MUSIC_MOODS,
  type CaptionDensity,
  type CaptionStylePreset,
  type CropStrategy,
  type EditBriefPacing,
  type EditBriefPlatform,
  type EditBriefSettings,
  type EditBriefTone,
  type MusicMood,
} from "../edit-briefs/types";
import type {
  CaptionPosition,
  CreateRenderJobBody,
  OverlayPosition,
  RenderCaptionCue,
  RenderEditBriefReference,
  RenderStyleOptions,
  RenderTemplateParameters,
  ValidationResult,
} from "./types";

const TEXT_FIELDS = [
  "workspaceId",
  "projectId",
  "userId",
  "sourceAssetId",
  "sourceFilename",
  "brandName",
  "audience",
] as const;

type TextField = (typeof TEXT_FIELDS)[number];

const CAPTION_POSITIONS = new Set<CaptionPosition>(["top", "center", "bottom"]);
const OVERLAY_POSITIONS = new Set<OverlayPosition>(["top", "center", "bottom", "left", "right"]);
const TEMPLATE_VARIANT_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SAFE_PARAMETER_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const SECRET_TEXT_PATTERN = /\b(api[_ -]?key|secret[_ -]?access[_ -]?key|secret|password|token)\b|sk-[a-z0-9_-]{8,}/i;
const EDIT_BRIEF_TONE_VALUES = new Set<EditBriefTone>(EDIT_BRIEF_TONES);
const EDIT_BRIEF_PACING_VALUES = new Set<EditBriefPacing>(EDIT_BRIEF_PACING);
const EDIT_BRIEF_PLATFORM_VALUES = new Set<EditBriefPlatform>(EDIT_BRIEF_PLATFORMS);
const CAPTION_STYLE_PRESET_VALUES = new Set<CaptionStylePreset>(CAPTION_STYLE_PRESETS);
const CAPTION_DENSITY_VALUES = new Set<CaptionDensity>(CAPTION_DENSITIES);
const CROP_STRATEGY_VALUES = new Set<CropStrategy>(CROP_STRATEGIES);
const MUSIC_MOOD_VALUES = new Set<MusicMood>(MUSIC_MOODS);

export function validateCreateRenderJobBody(body: unknown): ValidationResult<CreateRenderJobBody> {
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

  const textFieldDetails = TEXT_FIELDS.flatMap((field) => validateTextField(body, field));
  const details = [
    ...textFieldDetails,
    ...validatePositiveInteger(body, "sourceSizeBytes"),
    ...validatePositiveInteger(body, "durationSeconds"),
    ...validateClipCount(body.clipCount),
    ...validatePlatforms(body.platforms),
    ...validateTemplateVariant(body.templateVariant),
    ...validateTemplateParameters(body.templateParameters),
    ...validateStyleOptions(body.styleOptions),
    ...validateCaptionTimeline(body.captionTimeline),
    ...validateEditBrief(body.editBrief),
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
      sourceAssetId: body.sourceAssetId as string,
      sourceFilename: body.sourceFilename as string,
      sourceSizeBytes: body.sourceSizeBytes as number,
      durationSeconds: body.durationSeconds as number,
      brandName: body.brandName as string,
      audience: body.audience as string,
      clipCount: body.clipCount as number,
      platforms: body.platforms as string[],
      templateVariant: body.templateVariant as string,
      templateParameters: body.templateParameters as RenderTemplateParameters,
      styleOptions: body.styleOptions as RenderStyleOptions,
      captionTimeline: body.captionTimeline as RenderCaptionCue[],
      ...(body.editBrief !== undefined ? { editBrief: body.editBrief as RenderEditBriefReference } : {}),
    },
  };
}

export function validateRenderEditBriefReference(value: unknown): ApiErrorDetail[] {
  return validateEditBrief(value);
}

function validateTextField(body: Record<string, unknown>, field: TextField): ApiErrorDetail[] {
  const value = body[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    return [
      {
        field,
        code: "required",
        message: `${field} is required.`,
      },
    ];
  }

  return [];
}

function validatePositiveInteger(body: Record<string, unknown>, field: string): ApiErrorDetail[] {
  const value = body[field];

  if (!Number.isInteger(value) || Number(value) < 1) {
    return [
      {
        field,
        code: "invalid_positive_integer",
        message: `${field} must be a positive integer.`,
      },
    ];
  }

  return [];
}

function validateClipCount(value: unknown): ApiErrorDetail[] {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 25) {
    return [
      {
        field: "clipCount",
        code: "out_of_range",
        message: "clipCount must be between 1 and 25.",
      },
    ];
  }

  return [];
}

function validatePlatforms(value: unknown): ApiErrorDetail[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [
      {
        field: "platforms",
        code: "required",
        message: "platforms must include at least one target.",
      },
    ];
  }

  if (value.some((platform) => typeof platform !== "string" || platform.trim().length === 0)) {
    return [
      {
        field: "platforms",
        code: "invalid_item",
        message: "platforms cannot contain blank values.",
      },
    ];
  }

  return [];
}

function validateTemplateVariant(value: unknown): ApiErrorDetail[] {
  if (typeof value !== "string" || !TEMPLATE_VARIANT_PATTERN.test(value.trim())) {
    return [
      {
        field: "templateVariant",
        code: "invalid_template_variant",
        message: "templateVariant must be a safe slug.",
      },
    ];
  }

  return [];
}

function validateTemplateParameters(value: unknown): ApiErrorDetail[] {
  if (!isRecord(value)) {
    return [
      {
        field: "templateParameters",
        code: "invalid_type",
        message: "templateParameters must be an object.",
      },
    ];
  }

  const entries = Object.entries(value);

  if (entries.length > 50) {
    return [
      {
        field: "templateParameters",
        code: "too_many_items",
        message: "templateParameters cannot contain more than 50 entries.",
      },
    ];
  }

  const invalidEntry = entries.find(([key, parameterValue]) =>
    !SAFE_PARAMETER_KEY_PATTERN.test(key) || !isSafeTemplateParameterValue(parameterValue),
  );

  if (invalidEntry) {
    return [
      {
        field: `templateParameters.${invalidEntry[0]}`,
        code: "invalid_template_parameter",
        message: "template parameter values must be safe primitive values.",
      },
    ];
  }

  return [];
}

function validateStyleOptions(value: unknown): ApiErrorDetail[] {
  if (!isRecord(value)) {
    return [
      {
        field: "styleOptions",
        code: "invalid_type",
        message: "styleOptions must be an object.",
      },
    ];
  }

  const details: ApiErrorDetail[] = [];

  if (typeof value.fontFamily !== "string" || !isSafeDisplayText(value.fontFamily, 80)) {
    details.push({
      field: "styleOptions.fontFamily",
      code: "invalid_font_family",
      message: "fontFamily must be a safe display font name.",
    });
  }

  if (typeof value.brandColor !== "string" || !HEX_COLOR_PATTERN.test(value.brandColor)) {
    details.push({
      field: "styleOptions.brandColor",
      code: "invalid_color",
      message: "brandColor must be a six-digit hex color.",
    });
  }

  if (
    value.accentColor !== undefined &&
    (typeof value.accentColor !== "string" || !HEX_COLOR_PATTERN.test(value.accentColor))
  ) {
    details.push({
      field: "styleOptions.accentColor",
      code: "invalid_color",
      message: "accentColor must be a six-digit hex color.",
    });
  }

  if (typeof value.captionPosition !== "string" || !CAPTION_POSITIONS.has(value.captionPosition as CaptionPosition)) {
    details.push({
      field: "styleOptions.captionPosition",
      code: "invalid_position",
      message: "captionPosition must be top, center, or bottom.",
    });
  }

  if (typeof value.overlayPosition !== "string" || !OVERLAY_POSITIONS.has(value.overlayPosition as OverlayPosition)) {
    details.push({
      field: "styleOptions.overlayPosition",
      code: "invalid_position",
      message: "overlayPosition must be top, center, bottom, left, or right.",
    });
  }

  return details;
}

function validateCaptionTimeline(value: unknown): ApiErrorDetail[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [
      {
        field: "captionTimeline",
        code: "required",
        message: "captionTimeline must include at least one cue.",
      },
    ];
  }

  if (value.length > 500) {
    return [
      {
        field: "captionTimeline",
        code: "too_many_items",
        message: "captionTimeline cannot contain more than 500 cues.",
      },
    ];
  }

  const invalidIndex = value.findIndex((cue) => !isValidCaptionCue(cue));

  if (invalidIndex >= 0) {
    return [
      {
        field: `captionTimeline[${invalidIndex}]`,
        code: "invalid_caption_cue",
        message: "caption cues must include startMs, endMs, and safe text, with endMs after startMs.",
      },
    ];
  }

  return [];
}

function validateEditBrief(value: unknown): ApiErrorDetail[] {
  if (value === undefined) {
    return [];
  }

  if (!isRecord(value)) {
    return [
      {
        field: "editBrief",
        code: "invalid_type",
        message: "editBrief must be an object.",
      },
    ];
  }

  return [
    ...validateNestedText(value.id, "editBrief.id", 160),
    ...validateNestedText(value.versionId, "editBrief.versionId", 180),
    ...validatePositiveNestedInteger(value.versionNumber, "editBrief.versionNumber"),
    ...validateEditBriefSettings(value.settings),
  ];
}

function validateEditBriefSettings(value: unknown): ApiErrorDetail[] {
  if (!isRecord(value)) {
    return [
      {
        field: "editBrief.settings",
        code: "invalid_type",
        message: "editBrief.settings must be an object.",
      },
    ];
  }

  const settings = value as Partial<EditBriefSettings>;

  return [
    ...(settings.schemaVersion === EDIT_BRIEF_SCHEMA_VERSION
      ? []
      : [
          {
            field: "editBrief.settings.schemaVersion",
            code: "unsupported_value",
            message: "editBrief settings schemaVersion is not supported.",
          },
        ]),
    ...validateNestedText(settings.goal, "editBrief.settings.goal", 1_000),
    ...validateSetValue(settings.tone, "editBrief.settings.tone", EDIT_BRIEF_TONE_VALUES),
    ...validateSetValue(settings.pacing, "editBrief.settings.pacing", EDIT_BRIEF_PACING_VALUES),
    ...validateEditBriefPlatforms(settings.targetPlatforms),
    ...validateEditBriefMomentList(settings.include, "editBrief.settings.include"),
    ...validateEditBriefMomentList(settings.exclude, "editBrief.settings.exclude"),
    ...validateEditBriefClipLength(settings.clipLengthSeconds),
    ...validateEditBriefCaptionStyle(settings.captionStyle),
    ...validateSetValue(settings.cropStrategy, "editBrief.settings.cropStrategy", CROP_STRATEGY_VALUES),
    ...validateEditBriefMusic(settings.music),
    ...validateEditBriefEditorialRules(settings.editorialRules),
  ];
}

function validateNestedText(value: unknown, field: string, maxLength: number): ApiErrorDetail[] {
  if (typeof value !== "string" || !isSafeDisplayText(value, maxLength)) {
    return [
      {
        field,
        code: "unsafe_text",
        message: `${field} must be safe text.`,
      },
    ];
  }

  return [];
}

function validatePositiveNestedInteger(value: unknown, field: string): ApiErrorDetail[] {
  if (!Number.isInteger(value) || Number(value) < 1) {
    return [
      {
        field,
        code: "invalid_positive_integer",
        message: `${field} must be a positive integer.`,
      },
    ];
  }

  return [];
}

function validateSetValue<TValue extends string>(
  value: unknown,
  field: string,
  allowedValues: ReadonlySet<TValue>,
): ApiErrorDetail[] {
  if (typeof value !== "string" || !allowedValues.has(value as TValue)) {
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

function validateEditBriefPlatforms(value: unknown): ApiErrorDetail[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 5) {
    return [
      {
        field: "editBrief.settings.targetPlatforms",
        code: "invalid_array",
        message: "editBrief targetPlatforms must include one to five supported platforms.",
      },
    ];
  }

  const invalidIndex = value.findIndex((platform) =>
    typeof platform !== "string" || !EDIT_BRIEF_PLATFORM_VALUES.has(platform as EditBriefPlatform),
  );

  if (invalidIndex >= 0) {
    return [
      {
        field: `editBrief.settings.targetPlatforms[${invalidIndex}]`,
        code: "unsupported_platform",
        message: "editBrief targetPlatforms can only include supported platform values.",
      },
    ];
  }

  return [];
}

function validateEditBriefMomentList(value: unknown, field: string): ApiErrorDetail[] {
  if (!Array.isArray(value) || value.length > 25) {
    return [
      {
        field,
        code: "invalid_array",
        message: `${field} must be an array with at most 25 items.`,
      },
    ];
  }

  return value.flatMap((entry, index) => validateEditBriefMoment(entry, `${field}[${index}]`));
}

function validateEditBriefMoment(value: unknown, field: string): ApiErrorDetail[] {
  if (!isRecord(value)) {
    return [
      {
        field,
        code: "invalid_type",
        message: "Edit brief moment constraints must be objects.",
      },
    ];
  }

  const details = [
    ...validateNestedText(value.label, `${field}.label`, 240),
    ...(value.reason === undefined ? [] : validateNestedText(value.reason, `${field}.reason`, 500)),
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

function validateEditBriefClipLength(value: unknown): ApiErrorDetail[] {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.min) ||
    !Number.isInteger(value.max) ||
    Number(value.min) < 5 ||
    Number(value.max) > 180 ||
    Number(value.max) < Number(value.min)
  ) {
    return [
      {
        field: "editBrief.settings.clipLengthSeconds",
        code: "invalid_range",
        message: "editBrief clipLengthSeconds must define a 5 to 180 second range.",
      },
    ];
  }

  return [];
}

function validateEditBriefCaptionStyle(value: unknown): ApiErrorDetail[] {
  if (!isRecord(value)) {
    return [
      {
        field: "editBrief.settings.captionStyle",
        code: "invalid_type",
        message: "editBrief captionStyle must be an object.",
      },
    ];
  }

  return [
    ...validateSetValue(value.preset, "editBrief.settings.captionStyle.preset", CAPTION_STYLE_PRESET_VALUES),
    ...validateSetValue(value.density, "editBrief.settings.captionStyle.density", CAPTION_DENSITY_VALUES),
    ...(typeof value.emoji === "boolean"
      ? []
      : [
          {
            field: "editBrief.settings.captionStyle.emoji",
            code: "invalid_boolean",
            message: "editBrief captionStyle.emoji must be a boolean.",
          },
        ]),
  ];
}

function validateEditBriefMusic(value: unknown): ApiErrorDetail[] {
  if (!isRecord(value)) {
    return [
      {
        field: "editBrief.settings.music",
        code: "invalid_type",
        message: "editBrief music must be an object.",
      },
    ];
  }

  return [
    ...validateSetValue(value.mood, "editBrief.settings.music.mood", MUSIC_MOOD_VALUES),
    ...(typeof value.allowLicensed === "boolean"
      ? []
      : [
          {
            field: "editBrief.settings.music.allowLicensed",
            code: "invalid_boolean",
            message: "editBrief music.allowLicensed must be a boolean.",
          },
        ]),
  ];
}

function validateEditBriefEditorialRules(value: unknown): ApiErrorDetail[] {
  if (!Array.isArray(value) || value.length > 25) {
    return [
      {
        field: "editBrief.settings.editorialRules",
        code: "invalid_array",
        message: "editBrief editorialRules must be an array with at most 25 items.",
      },
    ];
  }

  return value.flatMap((rule, index) =>
    validateNestedText(rule, `editBrief.settings.editorialRules[${index}]`, 500),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeTemplateParameterValue(value: unknown): boolean {
  if (typeof value === "boolean") {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value === "string") {
    return isSafeDisplayText(value, 500);
  }

  return false;
}

function isValidCaptionCue(value: unknown): value is RenderCaptionCue {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Number.isInteger(value.startMs) &&
    Number(value.startMs) >= 0 &&
    Number.isInteger(value.endMs) &&
    Number(value.endMs) > Number(value.startMs) &&
    typeof value.text === "string" &&
    isSafeDisplayText(value.text, 500) &&
    (
      value.speaker === undefined ||
      (typeof value.speaker === "string" && isSafeDisplayText(value.speaker, 80))
    )
  );
}

function isSafeDisplayText(value: string, maxLength: number): boolean {
  const normalized = value.trim();

  if (normalized.length === 0 || normalized.length > maxLength) {
    return false;
  }

  return (
    !/[\u0000-\u001f\u007f]|javascript:|data:|https?:\/\/|[`$<>]/i.test(normalized) &&
    !SECRET_TEXT_PATTERN.test(normalized)
  );
}
