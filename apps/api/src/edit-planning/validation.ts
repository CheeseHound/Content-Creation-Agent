import type { ApiErrorDetail } from "../api-response";
import { validateRenderEditBriefReference } from "../render-jobs/validation";
import type {
  ClipCandidateInput,
  CreateEditDecisionListBody,
  EditPlanningBriefReference,
  TranscriptSegmentInput,
  ValidationResult,
} from "./types";

const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const UNSAFE_TEXT_PATTERN = /[\u0000-\u001f\u007f]|javascript:|data:|https?:\/\/|[`$<>]/i;
const SECRET_TEXT_PATTERN =
  /\b(api[_ -]?key|secret[_ -]?access[_ -]?key|secret|password|token)\b|sk-[a-z0-9_-]{8,}/i;
const MAX_TRANSCRIPT_TEXT_LENGTH = 5_000;
const MAX_CANDIDATES = 100;
const MAX_TRANSCRIPT_SEGMENTS = 500;

export function validateCreateEditDecisionListBody(
  body: unknown,
): ValidationResult<CreateEditDecisionListBody> {
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

  const hasCandidates = body.candidates !== undefined;
  const hasTranscriptSegments = body.transcriptSegments !== undefined;
  const details = [
    ...["workspaceId", "projectId", "userId", "sourceAssetId"].flatMap((field) =>
      validateIdField(body, field)
    ),
    ...(body.editBrief === undefined
      ? []
      : validateRenderEditBriefReference(body.editBrief).map((detail) => ({
        ...detail,
        field: `editBrief.${detail.field}`,
      }))),
    ...(hasCandidates ? validateCandidateList(body.candidates) : []),
    ...(hasTranscriptSegments ? validateTranscriptSegments(body.transcriptSegments) : []),
    ...(hasCandidates === hasTranscriptSegments
      ? [{
        field: "candidates",
        code: "invalid_input_source",
        message: "Provide exactly one of candidates or transcriptSegments.",
      }]
      : []),
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
      ...(body.editBrief !== undefined
        ? { editBrief: body.editBrief as EditPlanningBriefReference }
        : {}),
      ...(body.candidates !== undefined
        ? { candidates: body.candidates as ClipCandidateInput[] }
        : {}),
      ...(body.transcriptSegments !== undefined
        ? { transcriptSegments: body.transcriptSegments as TranscriptSegmentInput[] }
        : {}),
    },
  };
}

function validateCandidateList(value: unknown): ApiErrorDetail[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CANDIDATES) {
    return [{
      field: "candidates",
      code: "invalid_array",
      message: `candidates must include one to ${MAX_CANDIDATES} items.`,
    }];
  }

  return value.flatMap((candidate, index) => validateCandidate(candidate, `candidates[${index}]`));
}

function validateCandidate(value: unknown, field: string): ApiErrorDetail[] {
  if (!isRecord(value)) {
    return [{
      field,
      code: "invalid_type",
      message: "Clip candidates must be objects.",
    }];
  }

  return [
    ...validateIdValue(value.id, `${field}.id`),
    ...validateTimeline(value.startMs, value.endMs, field),
    ...validateSafeText(value.transcriptText, `${field}.transcriptText`),
    ...validateBaseScore(value.baseScore, `${field}.baseScore`),
  ];
}

function validateTranscriptSegments(value: unknown): ApiErrorDetail[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TRANSCRIPT_SEGMENTS) {
    return [{
      field: "transcriptSegments",
      code: "invalid_array",
      message: `transcriptSegments must include one to ${MAX_TRANSCRIPT_SEGMENTS} items.`,
    }];
  }

  return value.flatMap((segment, index) => validateTranscriptSegment(segment, `transcriptSegments[${index}]`));
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

function validateBaseScore(value: unknown, field: string): ApiErrorDetail[] {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 100) {
    return [{
      field,
      code: "invalid_score",
      message: "baseScore must be an integer from 0 to 100.",
    }];
  }

  return [];
}

function validateIdField(body: Record<string, unknown>, field: string): ApiErrorDetail[] {
  return validateIdValue(body[field], field);
}

function validateIdValue(value: unknown, field: string): ApiErrorDetail[] {
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
