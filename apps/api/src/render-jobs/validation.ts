import type { ApiErrorDetail } from "../api-response";
import type { CreateRenderJobBody, ValidationResult } from "./types";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
