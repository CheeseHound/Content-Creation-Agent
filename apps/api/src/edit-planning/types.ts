import type { EditBriefSettings } from "../edit-briefs/types";
import type { ProductAnalyticsSink } from "../analytics/types";
import type { ApiErrorDetail } from "../api-response";
import type { ActiveEditBriefRepository } from "../render-jobs/types";

export const EDIT_DECISION_LIST_SCHEMA_VERSION = "content_ops.edit_decision_list.v1";

export interface EditPlanningBriefReference {
  id: string;
  versionId: string;
  versionNumber: number;
  settings: EditBriefSettings;
}

export interface ClipCandidateInput {
  id: string;
  startMs: number;
  endMs: number;
  transcriptText: string;
  baseScore: number;
}

export interface TranscriptSegmentInput {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
}

export interface BuildEditDecisionListInput {
  workspaceId: string;
  projectId: string;
  sourceAssetId: string;
  editBrief: EditPlanningBriefReference;
  candidates: ClipCandidateInput[];
}

export interface BuildTranscriptClipCandidatesInput {
  sourceAssetId: string;
  segments: TranscriptSegmentInput[];
}

export interface CreateEditDecisionListBody {
  workspaceId: string;
  projectId: string;
  userId: string;
  sourceAssetId: string;
  editBrief?: EditPlanningBriefReference;
  candidates?: ClipCandidateInput[];
  transcriptSegments?: TranscriptSegmentInput[];
}

export interface EditDecisionList {
  schemaVersion: typeof EDIT_DECISION_LIST_SCHEMA_VERSION;
  id: string;
  workspaceId: string;
  projectId: string;
  sourceAssetId: string;
  editBriefId: string;
  editBriefVersionId: string;
  editBriefVersionNumber: number;
  idempotencyKey: string;
  decisions: EditDecision[];
}

export interface EditDecision {
  clipCandidateId: string;
  startMs: number;
  endMs: number;
  score: number;
  excluded: boolean;
  rank?: number;
  reasons: string[];
}

export interface EditDecisionListRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  sourceAssetId: string;
  editBriefId: string;
  editBriefVersionId: string;
  decisionList: EditDecisionList;
  idempotencyKey: string;
}

export interface CreateEditDecisionListResult {
  decisionList: EditDecisionList;
}

export interface EditDecisionListRepository {
  createEditDecisionList(record: EditDecisionListRecord): Promise<EditDecisionListRecord>;
}

export interface CreateEditDecisionListDependencies {
  editDecisionListRepository: EditDecisionListRepository;
  activeEditBriefRepository?: ActiveEditBriefRepository;
  analyticsSink?: ProductAnalyticsSink;
  now?: () => Date;
}

export interface ValidationResult<TValue> {
  ok: boolean;
  value?: TValue;
  details?: ApiErrorDetail[];
}
