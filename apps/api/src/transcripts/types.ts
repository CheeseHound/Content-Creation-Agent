import type { ProductAnalyticsSink } from "../analytics/types";
import type { TranscriptSegmentInput } from "../edit-planning/types";
import type { ApiErrorDetail } from "../api-response";

export const TRANSCRIPT_SCHEMA_VERSION = "content_ops.transcript.v1";

export interface PersistTranscriptBody {
  workspaceId: string;
  projectId: string;
  userId: string;
  sourceAssetId: string;
  language?: string;
  durationMs?: number;
  segments: TranscriptSegmentInput[];
}

export interface TranscriptRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  userId: string;
  sourceAssetId: string;
  schemaVersion: typeof TRANSCRIPT_SCHEMA_VERSION;
  language?: string;
  durationMs?: number;
  segments: TranscriptSegmentInput[];
  idempotencyKey: string;
}

export interface TranscriptRepository {
  createTranscript(record: TranscriptRecord): Promise<TranscriptRecord>;
  getLatestTranscript(request: {
    workspaceId: string;
    projectId: string;
    sourceAssetId: string;
  }): Promise<TranscriptRecord | undefined>;
}

export interface PersistTranscriptDependencies {
  transcriptRepository?: TranscriptRepository;
  analyticsSink?: ProductAnalyticsSink;
  now?: () => Date;
}

export interface PersistTranscriptResult {
  transcript: TranscriptRecord;
}

export interface ValidationResult<TValue> {
  ok: boolean;
  value?: TValue;
  details?: ApiErrorDetail[];
}
