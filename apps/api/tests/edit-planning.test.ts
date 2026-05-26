import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEditDecisionList } from "../src/edit-planning/contract";
import type {
  ClipCandidateInput,
  EditPlanningBriefReference,
} from "../src/edit-planning/types";

const EDIT_BRIEF: EditPlanningBriefReference = {
  id: "edit_brief_workspace_123_project_456_asset_abc",
  versionId: "edit_brief_version_workspace_123_project_456_asset_abc_1",
  versionNumber: 1,
  settings: {
    schemaVersion: "content_ops.edit_brief.v1",
    goal: "Create product demo clips.",
    tone: "educational",
    pacing: "fast",
    targetPlatforms: ["tiktok", "youtube_shorts"],
    include: [
      {
        label: "dashboard reveal",
      },
    ],
    exclude: [
      {
        label: "pricing tangent",
      },
    ],
    clipLengthSeconds: {
      min: 20,
      max: 45,
    },
    captionStyle: {
      preset: "bold",
      density: "medium",
      emoji: false,
    },
    cropStrategy: "screen_recording",
    music: {
      mood: "upbeat",
      allowLicensed: false,
    },
    editorialRules: ["Open on the strongest demo moment."],
  },
};

describe("buildEditDecisionList", () => {
  it("turns clip candidates and an edit brief into deterministic planning hints", () => {
    const decisionList = buildEditDecisionList({
      workspaceId: "workspace_123",
      projectId: "project_456",
      sourceAssetId: "asset_abc",
      editBrief: EDIT_BRIEF,
      candidates: [
        createCandidate({
          id: "clip_pricing",
          transcriptText: "The dashboard reveal is strong, then a pricing tangent starts.",
          baseScore: 95,
          endMs: 30_000,
        }),
        createCandidate({
          id: "clip_dashboard",
          transcriptText: "Here is the dashboard reveal and the workflow payoff.",
          baseScore: 75,
          endMs: 35_000,
        }),
        createCandidate({
          id: "clip_long",
          transcriptText: "A longer walkthrough with useful context.",
          baseScore: 80,
          endMs: 70_000,
        }),
      ],
    });

    assert.equal(decisionList.schemaVersion, "content_ops.edit_decision_list.v1");
    assert.equal(decisionList.editBriefId, EDIT_BRIEF.id);
    assert.equal(decisionList.editBriefVersionId, EDIT_BRIEF.versionId);
    assert.deepEqual(
      decisionList.decisions.map((decision) => ({
        clipCandidateId: decision.clipCandidateId,
        excluded: decision.excluded,
        rank: decision.rank,
      })),
      [
        {
          clipCandidateId: "clip_dashboard",
          excluded: false,
          rank: 1,
        },
        {
          clipCandidateId: "clip_long",
          excluded: false,
          rank: 2,
        },
        {
          clipCandidateId: "clip_pricing",
          excluded: true,
          rank: undefined,
        },
      ],
    );
    assert.deepEqual(decisionList.decisions[0]?.reasons, [
      "Matches requested include moment: dashboard reveal.",
      "Fits requested 20-45 second clip length.",
      "Fast pacing favors a tight clip.",
    ]);
    assert.match(decisionList.idempotencyKey, /^edit-decision-list:workspace_123:project_456:asset_abc:/);
  });

  it("does not carry raw chat text from extra edit brief settings fields", () => {
    const decisionList = buildEditDecisionList({
      workspaceId: "workspace_123",
      projectId: "project_456",
      sourceAssetId: "asset_abc",
      editBrief: {
        ...EDIT_BRIEF,
        settings: {
          ...EDIT_BRIEF.settings,
          chatMessage: "Make this punchy, but never persist this raw note.",
        } as EditPlanningBriefReference["settings"] & { chatMessage: string },
      },
      candidates: [
        createCandidate({
          id: "clip_dashboard",
          transcriptText: "Here is the dashboard reveal.",
          baseScore: 75,
          endMs: 30_000,
        }),
      ],
    });

    assert.doesNotMatch(
      JSON.stringify(decisionList),
      /chatMessage|never persist this raw note/,
    );
  });
});

function createCandidate(overrides: Partial<ClipCandidateInput>): ClipCandidateInput {
  return {
    id: "clip_candidate",
    startMs: 0,
    endMs: 30_000,
    transcriptText: "Default clip candidate transcript.",
    baseScore: 50,
    ...overrides,
  };
}
