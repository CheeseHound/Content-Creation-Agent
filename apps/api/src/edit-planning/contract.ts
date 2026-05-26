import { createHash } from "node:crypto";

import {
  EDIT_DECISION_LIST_SCHEMA_VERSION,
  type BuildEditDecisionListInput,
  type ClipCandidateInput,
  type EditDecision,
  type EditDecisionList,
} from "./types";

export function buildEditDecisionList(input: BuildEditDecisionListInput): EditDecisionList {
  const scoredDecisions = input.candidates.map((candidate) =>
    scoreCandidate(candidate, input.editBrief.settings),
  );
  const rankedDecisions = rankIncludedDecisions(scoredDecisions);
  const idempotencyKey = buildEditDecisionListIdempotencyKey(input, rankedDecisions);
  const id = `edit_decision_list_${fingerprint(idempotencyKey)}`;

  return {
    schemaVersion: EDIT_DECISION_LIST_SCHEMA_VERSION,
    id,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    sourceAssetId: input.sourceAssetId,
    editBriefId: input.editBrief.id,
    editBriefVersionId: input.editBrief.versionId,
    editBriefVersionNumber: input.editBrief.versionNumber,
    idempotencyKey,
    decisions: rankedDecisions,
  };
}

function scoreCandidate(
  candidate: ClipCandidateInput,
  settings: BuildEditDecisionListInput["editBrief"]["settings"],
): EditDecision {
  const transcript = candidate.transcriptText.toLowerCase();
  const includeMatches = settings.include.filter((moment) =>
    transcript.includes(moment.label.toLowerCase()),
  );
  const excludeMatches = settings.exclude.filter((moment) =>
    transcript.includes(moment.label.toLowerCase()),
  );
  const durationSeconds = Math.round((candidate.endMs - candidate.startMs) / 1_000);
  const lengthFits = (
    durationSeconds >= settings.clipLengthSeconds.min &&
    durationSeconds <= settings.clipLengthSeconds.max
  );
  const pacingHint = buildPacingHint(settings.pacing, durationSeconds);
  const score = candidate.baseScore +
    includeMatches.length * 20 +
    (lengthFits ? 5 : -10) +
    pacingHint.scoreDelta -
    excludeMatches.length * 100;

  return {
    clipCandidateId: candidate.id,
    startMs: candidate.startMs,
    endMs: candidate.endMs,
    score,
    excluded: excludeMatches.length > 0,
    reasons: [
      ...includeMatches.map((moment) => `Matches requested include moment: ${moment.label}.`),
      ...excludeMatches.map((moment) => `Matches requested exclude moment: ${moment.label}.`),
      lengthFits
        ? `Fits requested ${settings.clipLengthSeconds.min}-${settings.clipLengthSeconds.max} second clip length.`
        : `Outside requested ${settings.clipLengthSeconds.min}-${settings.clipLengthSeconds.max} second clip length.`,
      ...(pacingHint.reason ? [pacingHint.reason] : []),
    ],
  };
}

function rankIncludedDecisions(decisions: EditDecision[]): EditDecision[] {
  const included = decisions
    .filter((decision) => !decision.excluded)
    .sort(compareDecisionPriority)
    .map((decision, index) => ({
      ...decision,
      rank: index + 1,
    }));
  const excluded = decisions
    .filter((decision) => decision.excluded)
    .sort(compareDecisionPriority);

  return [...included, ...excluded];
}

function compareDecisionPriority(left: EditDecision, right: EditDecision): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  if (left.startMs !== right.startMs) {
    return left.startMs - right.startMs;
  }

  return left.clipCandidateId.localeCompare(right.clipCandidateId);
}

function buildPacingHint(
  pacing: BuildEditDecisionListInput["editBrief"]["settings"]["pacing"],
  durationSeconds: number,
): { scoreDelta: number; reason?: string } {
  if ((pacing === "fast" || pacing === "very_fast") && durationSeconds <= 45) {
    return {
      scoreDelta: pacing === "very_fast" ? 8 : 5,
      reason: pacing === "very_fast"
        ? "Very fast pacing favors the tightest clips."
        : "Fast pacing favors a tight clip.",
    };
  }

  if (pacing === "slow" && durationSeconds >= 45) {
    return {
      scoreDelta: 5,
      reason: "Slow pacing allows a longer context clip.",
    };
  }

  return { scoreDelta: 0 };
}

function buildEditDecisionListIdempotencyKey(
  input: BuildEditDecisionListInput,
  decisions: EditDecision[],
): string {
  return [
    "edit-decision-list",
    input.workspaceId,
    input.projectId,
    input.sourceAssetId,
    input.editBrief.versionId,
    fingerprint(decisions),
  ].join(":");
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
