import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PostgresTranscriptRepository } from "../src/transcripts/postgres-repository";
import type { TranscriptRecord } from "../src/transcripts/types";
import type { PostgresQueryClient } from "../src/render-jobs/postgres-repository";

const TRANSCRIPT_RECORD: TranscriptRecord = {
  id: "transcript_fixture",
  workspaceId: "workspace_123",
  projectId: "project_456",
  userId: "user_789",
  sourceAssetId: "asset_abc",
  schemaVersion: "content_ops.transcript.v1",
  language: "en",
  durationMs: 45_000,
  segments: [{
    startMs: 0,
    endMs: 20_000,
    text: "Here is the dashboard reveal.",
  }],
  idempotencyKey: "transcript:workspace_123:project_456:asset_abc:fixture",
};

describe("PostgresTranscriptRepository", () => {
  it("persists transcripts idempotently and reads the latest source transcript", async () => {
    const client = new FakePgClient([
      [toRow(TRANSCRIPT_RECORD)],
      [toRow(TRANSCRIPT_RECORD)],
    ]);
    const repository = new PostgresTranscriptRepository(client);

    const created = await repository.createTranscript(TRANSCRIPT_RECORD);
    const latest = await repository.getLatestTranscript({
      workspaceId: "workspace_123",
      projectId: "project_456",
      sourceAssetId: "asset_abc",
    });

    assert.deepEqual(created, TRANSCRIPT_RECORD);
    assert.deepEqual(latest, TRANSCRIPT_RECORD);
    assert.equal(client.queries.length, 2);
    assert.match(client.queries[0]?.text ?? "", /insert into transcripts/i);
    assert.match(client.queries[0]?.text ?? "", /on conflict \(idempotency_key\)/i);
    assert.match(client.queries[1]?.text ?? "", /order by created_at desc/);
    assert.doesNotMatch(JSON.stringify(client.queries), /api_key|secret/i);
  });
});

function toRow(record: TranscriptRecord) {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    project_id: record.projectId,
    user_id: record.userId,
    source_asset_id: record.sourceAssetId,
    schema_version: record.schemaVersion,
    language: record.language,
    duration_ms: record.durationMs,
    segments: record.segments,
    idempotency_key: record.idempotencyKey,
  };
}

interface QueryCall {
  text: string;
  values: readonly unknown[];
}

class FakePgClient implements PostgresQueryClient {
  queries: readonly QueryCall[] = [];
  private responses: readonly (readonly Record<string, unknown>[])[];

  constructor(responses: readonly (readonly Record<string, unknown>[])[]) {
    this.responses = responses;
  }

  async query<T>(text: string, values: readonly unknown[] = []): Promise<{ rows: T[] }> {
    const [rows = [], ...remainingResponses] = this.responses;
    this.responses = remainingResponses;
    this.queries = [...this.queries, { text, values }];

    return {
      rows: [...rows] as T[],
    };
  }
}
