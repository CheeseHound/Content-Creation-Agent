import type { ApiErrorDetail } from "../api-response";
import type { PersistTranscriptBody, ValidationResult } from "./types";

const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const LANGUAGE_PATTERN = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const UNSAFE_TEXT_PATTERN = /[\u0000-\u001f\u007f]|javascript:|data:|https?:\/\/|[`$<>]/i;
const SECRET_TEXT_PATTERN =
  /\b(api[_ -]?key|secret[_ -]?access[_ -]?key|secret|password|token)\b|sk-[a-z0-9_-]{8,}/i;
const MAX_TRANSCRIPT_TEXT_LENGTH = 5_000;
const MAX_TRANSCRIPT_SEGMENTS = 1_000;

export function validatePersistTranscriptBody(
  body: unknown,
): ValidationResult<PersistTranscriptBody> {
  if (!isRecord(body)) {
    return {
      ok: false,
      details: [{
        field: "body",
        code: "invalid_type",
        message: "Request body must be a JSON object.",
      }],
    };
  }

  const details = [
    ...["workspaceId", "projectId", "userId", "sourceAssetId"].flatMap((field) =>
      validateIdField(body, field)
    ),
    ...validateTranscriptSegments(body.segments),
    ...(body.language === undefined ? [] : validateLanguage(body.language)),
    ...(body.durationMs === undefined ? [] : validateDurationMs(body.durationMs)),
  ];

  if (details.length > 0) {
    return { ok: false, details };
  }

  return {
    ok: true,
    value: {
      workspaceId: body.workspaceId as string,
      projectId: body.projectId as string,
      userId: body.userId as string,
      sourceAssetId: body.sourceAssetId as string,
      ...(body.language ? { language: body.language as string } : {}),
      ...(body.durationMs === undefined ? {} : { durationMs: body.durationMs as number }),
      segments: body.segments as PersistTranscriptBody["segments"],
    },
  };
}

function validateTranscriptSegments(value: unknown): ApiErrorDetail[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TRANSCRIPT_SEGMENTS) {
    return [{
      field: "segments",
      code: "invalid_array",
      message: `segments must include one to ${MAX_TRANSCRIPT_SEGMENTS} items.`,
    }];
  }

  return value.flatMap((segment, index) => validateTranscriptSegment(segment, `segments[${index}]`));
}

function validateTranscriptSegment(value: unknown, field: string): ApiErrorDetail[] {
  if (!isRecord(value)) {
    return [{
      field,
      code: "invalid_type",
      message: "Transcript segments must be objects.",
    }];
  }

  return [
    ...validateTimeline(value.startMs, value.endMs, field),
    ...validateSafeText(value.text, `${field}.text`),
    ...(value.speaker === undefined ? [] : validateSafeText(value.speaker, `${field}.speaker`)),
  ];
}

function validateTimeline(startMs: unknown, endMs: unknown, field: string): ApiErrorDetail[] {
  const details: ApiErrorDetail[] = [];

  if (!Number.isInteger(startMs) || Number(startMs) < 0) {
    details.push({
      field: `${field}.startMs`,
      code: "invalid_timestamp",
      message: "startMs must be a non-negative integer.",
    });
  }

  if (!Number.isInteger(endMs) || Number(endMs) <= Number(startMs)) {
    details.push({
      field: `${field}.endMs`,
      code: "invalid_timestamp",
      message: "endMs must be greater than startMs.",
    });
  }

  return details;
}

function validateLanguage(value: unknown): ApiErrorDetail[] {
  if (typeof value !== "string" || !LANGUAGE_PATTERN.test(value)) {
    return [{
      field: "language",
      code: "invalid_language",
      message: "language must be a BCP-47 style language tag like en or en-US.",
    }];
  }

  return [];
}

function validateDurationMs(value: unknown): ApiErrorDetail[] {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    return [{
      field: "durationMs",
      code: "invalid_duration",
      message: "durationMs must be a positive integer.",
    }];
  }

  return [];
}

function validateIdField(body: Record<string, unknown>, field: string): ApiErrorDetail[] {
  const value = body[field];

  if (typeof value !== "string" || !SAFE_ID_PATTERN.test(value.trim())) {
    return [{
      field,
      code: "invalid_id",
      message: `${field} must be a safe non-empty identifier.`,
    }];
  }

  return [];
}

function validateSafeText(value: unknown, field: string): ApiErrorDetail[] {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > MAX_TRANSCRIPT_TEXT_LENGTH ||
    UNSAFE_TEXT_PATTERN.test(value) ||
    SECRET_TEXT_PATTERN.test(value)
  ) {
    return [{
      field,
      code: "unsafe_text",
      message: `${field} must be safe text under ${MAX_TRANSCRIPT_TEXT_LENGTH} characters.`,
    }];
  }

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
