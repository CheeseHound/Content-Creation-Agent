import { trackProductAnalyticsEventBestEffort } from "../analytics/product-events";
import { buildTranscriptRecord } from "./contract";
import type {
  PersistTranscriptBody,
  PersistTranscriptDependencies,
  PersistTranscriptResult,
} from "./types";

export async function persistTranscript(
  request: PersistTranscriptBody,
  dependencies: PersistTranscriptDependencies,
): Promise<PersistTranscriptResult> {
  if (!dependencies.transcriptRepository) {
    throw new Error("transcript repository is required");
  }

  const transcript = buildTranscriptRecord(request);
  const persisted = await dependencies.transcriptRepository.createTranscript(transcript);

  await trackProductAnalyticsEventBestEffort({
    sink: dependencies.analyticsSink,
    eventName: "source_transcribed",
    workspaceId: persisted.workspaceId,
    projectId: persisted.projectId,
    userId: persisted.userId,
    sourceAssetId: persisted.sourceAssetId,
    occurredAt: dependencies.now?.() ?? new Date(),
    properties: {
      segmentCount: persisted.segments.length,
      durationMs: persisted.durationMs,
      language: persisted.language,
    },
  });

  return { transcript: persisted };
}
