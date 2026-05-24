import type { ApiErrorDetail } from "../api-response";
import type { CreateUploadPresignBody, UploadValidationResult } from "./types";

const TEXT_FIELDS = ["workspaceId", "projectId", "userId", "filename"] as const;
const ALLOWED_CONTENT_TYPES = new Set([
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/x-matroska",
  "video/x-msvideo",
]);

type TextField = (typeof TEXT_FIELDS)[number];

export function validateCreateUploadPresignBody(body: unknown): UploadValidationResult {
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
    ...TEXT_FIELDS.flatMap((field) => validateTextField(body, field)),
    ...validatePositiveInteger(body, "sizeBytes"),
    ...validateOptionalPositiveInteger(body, "durationSeconds"),
    ...validateContentType(body.contentType),
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
      workspaceId: normalizeText(body.workspaceId),
      projectId: normalizeText(body.projectId),
      userId: normalizeText(body.userId),
      filename: normalizeText(body.filename),
      contentType: normalizeText(body.contentType).toLowerCase(),
      sizeBytes: body.sizeBytes as number,
      durationSeconds: body.durationSeconds as number | undefined,
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

function validateOptionalPositiveInteger(
  body: Record<string, unknown>,
  field: string,
): ApiErrorDetail[] {
  if (body[field] === undefined) {
    return [];
  }

  return validatePositiveInteger(body, field);
}

function validateContentType(value: unknown): ApiErrorDetail[] {
  if (typeof value !== "string" || !ALLOWED_CONTENT_TYPES.has(value.trim().toLowerCase())) {
    return [
      {
        field: "contentType",
        code: "unsupported_content_type",
        message: "contentType must be a supported audio or video MIME type.",
      },
    ];
  }

  return [];
}

function normalizeText(value: unknown): string {
  return String(value).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
