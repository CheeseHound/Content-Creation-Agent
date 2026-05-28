import { createHash } from "node:crypto";

import {
  TRANSCRIPT_SCHEMA_VERSION,
  type PersistTranscriptBody,
  type TranscriptRecord,
} from "./types";

export function buildTranscriptRecord(body: PersistTranscriptBody): TranscriptRecord {
  const segments = body.segments.map((segment) => ({
    startMs: segment.startMs,
    endMs: segment.endMs,
    text: normalizeWhitespace(segment.text),
    ...(segment.speaker ? { speaker: normalizeWhitespace(segment.speaker) } : {}),
  }));
  const idempotencyKey = [
    "transcript",
    body.workspaceId,
    body.projectId,
    body.sourceAssetId,
    fingerprint({
      durationMs: body.durationMs,
      language: body.language,
      segments,
    }),
  ].join(":");

  return {
    id: `transcript_${fingerprint(idempotencyKey)}`,
    workspaceId: body.workspaceId,
    projectId: body.projectId,
    userId: body.userId,
    sourceAssetId: body.sourceAssetId,
    schemaVersion: TRANSCRIPT_SCHEMA_VERSION,
    ...(body.language ? { language: body.language } : {}),
    ...(body.durationMs === undefined ? {} : { durationMs: body.durationMs }),
    segments,
    idempotencyKey,
  };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function fingerprint(value: unknown): string {
  return createHash("sha256")
    .update(stableStringify(value))
    .digest("hex")
    .slice(0, 12);
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
