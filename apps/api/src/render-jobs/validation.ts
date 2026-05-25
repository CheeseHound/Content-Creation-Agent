import type { ApiErrorDetail } from "../api-response";
import type {
  CaptionPosition,
  CreateRenderJobBody,
  OverlayPosition,
  RenderCaptionCue,
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
    },
  };
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

  return !/[\u0000-\u001f\u007f]|javascript:|data:|https?:\/\/|[`$<>]/i.test(normalized);
}
