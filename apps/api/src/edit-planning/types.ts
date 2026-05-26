import type { EditBriefSettings } from "../edit-briefs/types";

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

export interface BuildEditDecisionListInput {
  workspaceId: string;
  projectId: string;
  sourceAssetId: string;
  editBrief: EditPlanningBriefReference;
  candidates: ClipCandidateInput[];
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
