import type { PostgresQueryClient } from "../render-jobs/postgres-repository";
import {
  TRANSCRIPT_SCHEMA_VERSION,
  type TranscriptRecord,
  type TranscriptRepository,
} from "./types";

interface TranscriptRow {
  id: unknown;
  workspace_id: unknown;
  project_id: unknown;
  user_id: unknown;
  source_asset_id: unknown;
  schema_version: unknown;
  language: unknown;
  duration_ms: unknown;
  segments: unknown;
  idempotency_key: unknown;
}

export class PostgresTranscriptRepository implements TranscriptRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async createTranscript(record: TranscriptRecord): Promise<TranscriptRecord> {
    const result = await this.client.query<TranscriptRow>(
      `
        insert into transcripts (
          id,
          workspace_id,
          project_id,
          user_id,
          source_asset_id,
          schema_version,
          language,
          duration_ms,
          segments,
          idempotency_key
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
        on conflict (idempotency_key) do update
          set segments = transcripts.segments
        returning
          id,
          workspace_id,
          project_id,
          user_id,
          source_asset_id,
          schema_version,
          language,
          duration_ms,
          segments,
          idempotency_key
      `,
      [
        record.id,
        record.workspaceId,
        record.projectId,
        record.userId,
        record.sourceAssetId,
        record.schemaVersion,
        record.language ?? null,
        record.durationMs ?? null,
        JSON.stringify(record.segments),
        record.idempotencyKey,
      ],
    );

    return mapTranscriptRow(requireRow(result.rows[0]));
  }

  async getLatestTranscript(request: {
    workspaceId: string;
    projectId: string;
    sourceAssetId: string;
  }): Promise<TranscriptRecord | undefined> {
    const result = await this.client.query<TranscriptRow>(
      `
        select
          id,
          workspace_id,
          project_id,
          user_id,
          source_asset_id,
          schema_version,
          language,
          duration_ms,
          segments,
          idempotency_key
        from transcripts
        where workspace_id = $1
          and project_id = $2
          and source_asset_id = $3
        order by created_at desc, id asc
        limit 1
      `,
      [request.workspaceId, request.projectId, request.sourceAssetId],
    );
    const row = result.rows[0];

    return row ? mapTranscriptRow(row) : undefined;
  }
}

function mapTranscriptRow(row: TranscriptRow): TranscriptRecord {
  const schemaVersion = requireString(row.schema_version, "schema_version");

  if (schemaVersion !== TRANSCRIPT_SCHEMA_VERSION) {
    throw new Error(`unsupported transcript schema version: ${schemaVersion}`);
  }

  return {
    id: requireString(row.id, "id"),
    workspaceId: requireString(row.workspace_id, "workspace_id"),
    projectId: requireString(row.project_id, "project_id"),
    userId: requireString(row.user_id, "user_id"),
    sourceAssetId: requireString(row.source_asset_id, "source_asset_id"),
    schemaVersion,
    ...(row.language === null || row.language === undefined
      ? {}
      : { language: requireString(row.language, "language") }),
    ...(row.duration_ms === null || row.duration_ms === undefined
      ? {}
      : { durationMs: toNonNegativeInteger(row.duration_ms, "duration_ms") }),
    segments: parseJsonArray<TranscriptRecord["segments"][number]>(row.segments, "segments"),
    idempotencyKey: requireString(row.idempotency_key, "idempotency_key"),
  };
}

function requireRow(row: TranscriptRow | undefined): TranscriptRow {
  if (!row) {
    throw new Error("transcript insert did not return a row");
  }

  return row;
}

function parseJsonArray<TValue>(value: unknown, field: string): TValue[] {
  const parsedValue = typeof value === "string" ? JSON.parse(value) as unknown : value;

  if (!Array.isArray(parsedValue)) {
    throw new Error(`${field} must be a JSON array`);
  }

  return parsedValue as TValue[];
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }

  return value;
}

function toNonNegativeInteger(value: unknown, field: string): number {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }

  return numberValue;
}
