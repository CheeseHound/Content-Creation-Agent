import { trackProductAnalyticsEventBestEffort } from "../analytics/product-events";
import {
  buildEditDecisionList,
  buildTranscriptClipCandidates,
} from "./contract";
import type {
  ClipCandidateInput,
  CreateEditDecisionListBody,
  CreateEditDecisionListDependencies,
  CreateEditDecisionListResult,
  EditDecisionListRecord,
  EditPlanningBriefReference,
} from "./types";

export class EditDecisionListMissingBriefError extends Error {
  constructor() {
    super("No active edit brief exists for this source asset or project.");
    this.name = "EditDecisionListMissingBriefError";
  }
}

export class EditDecisionListInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditDecisionListInputError";
  }
}

export class EditDecisionListMissingTranscriptError extends Error {
  constructor() {
    super("No stored transcript exists for this source asset.");
    this.name = "EditDecisionListMissingTranscriptError";
  }
}

export async function createEditDecisionList(
  request: CreateEditDecisionListBody,
  dependencies: CreateEditDecisionListDependencies,
): Promise<CreateEditDecisionListResult> {
  const editBrief = await resolveEditBrief(request, dependencies);
  const candidates = await resolveCandidates(request, dependencies);
  const decisionList = buildEditDecisionList({
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    sourceAssetId: request.sourceAssetId,
    editBrief,
    candidates,
  });
  const record: EditDecisionListRecord = {
    id: decisionList.id,
    workspaceId: decisionList.workspaceId,
    projectId: decisionList.projectId,
    sourceAssetId: decisionList.sourceAssetId,
    editBriefId: decisionList.editBriefId,
    editBriefVersionId: decisionList.editBriefVersionId,
    decisionList,
    idempotencyKey: decisionList.idempotencyKey,
  };
  const persisted = await dependencies.editDecisionListRepository.createEditDecisionList(record);

  await trackProductAnalyticsEventBestEffort({
    sink: dependencies.analyticsSink,
    eventName: "decision_list_created",
    workspaceId: persisted.workspaceId,
    projectId: persisted.projectId,
    sourceAssetId: persisted.sourceAssetId,
    editBriefId: persisted.editBriefId,
    decisionListId: persisted.id,
    occurredAt: dependencies.now?.() ?? new Date(),
    properties: {
      candidateCount: candidates.length,
      decisionCount: persisted.decisionList.decisions.length,
      excludedCount: persisted.decisionList.decisions
        .filter((decision) => decision.excluded).length,
      contentProfile: persisted.decisionList.contentProfile,
      inputSource: request.candidates
        ? "candidates"
        : request.transcriptSegments
          ? "transcript_segments"
          : "stored_transcript",
      rankedCount: persisted.decisionList.decisions
        .filter((decision) => decision.rank !== undefined).length,
    },
  });

  return {
    decisionList: persisted.decisionList,
  };
}

async function resolveEditBrief(
  request: CreateEditDecisionListBody,
  dependencies: CreateEditDecisionListDependencies,
): Promise<EditPlanningBriefReference> {
  if (request.editBrief) {
    return request.editBrief;
  }

  const activeEditBrief = await dependencies.activeEditBriefRepository?.getActiveEditBrief({
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    sourceAssetId: request.sourceAssetId,
  });

  if (!activeEditBrief) {
    throw new EditDecisionListMissingBriefError();
  }

  return {
    id: activeEditBrief.id,
    versionId: activeEditBrief.versionId,
    versionNumber: activeEditBrief.versionNumber,
    settings: activeEditBrief.settings,
  };
}

async function resolveCandidates(
  request: CreateEditDecisionListBody,
  dependencies: CreateEditDecisionListDependencies,
): Promise<ClipCandidateInput[]> {
  const candidates = request.candidates ??
    (request.transcriptSegments
      ? buildTranscriptClipCandidates({
        sourceAssetId: request.sourceAssetId,
        segments: request.transcriptSegments,
      })
      : await buildStoredTranscriptCandidates(request, dependencies));

  if (candidates.length === 0) {
    throw new EditDecisionListInputError("At least one clip candidate is required.");
  }

  return candidates;
}

async function buildStoredTranscriptCandidates(
  request: CreateEditDecisionListBody,
  dependencies: CreateEditDecisionListDependencies,
): Promise<ClipCandidateInput[]> {
  if (!request.useStoredTranscript) {
    return [];
  }

  const transcript = await dependencies.transcriptRepository?.getLatestTranscript({
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    sourceAssetId: request.sourceAssetId,
  });

  if (!transcript) {
    throw new EditDecisionListMissingTranscriptError();
  }

  return buildTranscriptClipCandidates({
    sourceAssetId: request.sourceAssetId,
    segments: transcript.segments,
  });
}
