import assert from "node:assert/strict";
import { once } from "node:events";
import type http from "node:http";
import { describe, it } from "node:test";

import { createStaticAdminAuthorizer } from "../src/admin/auth";
import type {
  ProductAnalyticsEventPayload,
  ProductAnalyticsSink,
} from "../src/analytics/types";
import type { EditBriefReadModel } from "../src/edit-briefs/types";
import { createEditDecisionListHandler } from "../src/edit-planning/route";
import type {
  CreateEditDecisionListBody,
  EditDecisionListRecord,
  EditDecisionListRepository,
  EditPlanningBriefReference,
} from "../src/edit-planning/types";
import { createApiServer, createInMemoryDependencies } from "../src/server";

const EDIT_BRIEF: EditPlanningBriefReference = {
  id: "edit_brief_workspace_123_project_456_asset_abc",
  versionId: "edit_brief_version_workspace_123_project_456_asset_abc_1",
  versionNumber: 1,
  settings: {
    schemaVersion: "content_ops.edit_brief.v1",
    goal: "Find product demo moments.",
    tone: "educational",
    pacing: "fast",
    targetPlatforms: ["tiktok", "youtube_shorts"],
    include: [{ label: "dashboard reveal" }],
    exclude: [{ label: "pricing tangent" }],
    clipLengthSeconds: { min: 10, max: 45 },
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

describe("POST /api/edit-decision-lists", () => {
  it("builds and persists a decision list from transcript segments and an active edit brief", async () => {
    const repository = new RecordingEditDecisionListRepository();
    const analyticsSink = new RecordingAnalyticsSink();
    const handler = createEditDecisionListHandler({
      editDecisionListRepository: repository,
      activeEditBriefRepository: new StaticActiveEditBriefRepository(EDIT_BRIEF),
      analyticsSink,
      now: () => new Date("2026-05-28T04:00:00.000Z"),
    });

    const response = await handler({
      body: {
        workspaceId: "workspace_123",
        projectId: "project_456",
        userId: "user_789",
        sourceAssetId: "asset_abc",
        transcriptSegments: [
          {
            startMs: 0,
            endMs: 25_000,
            text: "Here is the dashboard reveal and workflow payoff.",
          },
          {
            startMs: 25_000,
            endMs: 50_000,
            text: "This part turns into a pricing tangent.",
          },
        ],
      } satisfies CreateEditDecisionListBody,
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    if (!response.body.success) {
      assert.fail("Expected decision list creation to succeed.");
    }
    assert.equal(repository.records.length, 1);
    assert.deepEqual(
      response.body.data.decisionList.decisions.map((decision) => ({
        clipCandidateId: decision.clipCandidateId,
        excluded: decision.excluded,
        rank: decision.rank,
      })),
      [
        {
          clipCandidateId: "clip_candidate_asset_abc_1",
          excluded: false,
          rank: 1,
        },
        {
          clipCandidateId: "clip_candidate_asset_abc_2",
          excluded: true,
          rank: undefined,
        },
      ],
    );
    assert.deepEqual(analyticsSink.events.map((event) => event.eventName), [
      "decision_list_created",
    ]);
    assert.equal(analyticsSink.events[0]?.decisionListId, response.body.data.decisionList.id);
    assert.doesNotMatch(
      JSON.stringify({ response: response.body, records: repository.records, events: analyticsSink.events }),
      /Here is the dashboard reveal|pricing tangent starts|transcriptSegments|transcriptText|storageKey|SECRET/i,
    );
  });

  it("uses explicit clip candidates and edit brief references when provided", async () => {
    const repository = new RecordingEditDecisionListRepository();
    const activeRepository = new StaticActiveEditBriefRepository(undefined);
    const handler = createEditDecisionListHandler({
      editDecisionListRepository: repository,
      activeEditBriefRepository: activeRepository,
    });

    const response = await handler({
      body: {
        workspaceId: "workspace_123",
        projectId: "project_456",
        userId: "user_789",
        sourceAssetId: "asset_abc",
        editBrief: EDIT_BRIEF,
        candidates: [{
          id: "candidate_1",
          startMs: 0,
          endMs: 20_000,
          transcriptText: "A dashboard reveal with a workflow result.",
          baseScore: 70,
        }],
      } satisfies CreateEditDecisionListBody,
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(activeRepository.requests.length, 0);
  });

  it("requires an active edit brief when no explicit edit brief is supplied", async () => {
    const handler = createEditDecisionListHandler({
      editDecisionListRepository: new RecordingEditDecisionListRepository(),
      activeEditBriefRepository: new StaticActiveEditBriefRepository(undefined),
    });

    const response = await handler({
      body: {
        workspaceId: "workspace_123",
        projectId: "project_456",
        userId: "user_789",
        sourceAssetId: "asset_abc",
        transcriptSegments: [{
          startMs: 0,
          endMs: 20_000,
          text: "A dashboard reveal with a workflow result.",
        }],
      } satisfies CreateEditDecisionListBody,
    });

    assert.equal(response.status, 409);
    assert.equal(response.body.success, false);
    if (response.body.success) {
      assert.fail("Expected missing brief error.");
    }
    assert.equal(response.body.error.code, "active_edit_brief_required");
  });

  it("rejects ambiguous candidate and transcript input before persistence", async () => {
    const repository = new RecordingEditDecisionListRepository();
    const handler = createEditDecisionListHandler({
      editDecisionListRepository: repository,
      activeEditBriefRepository: new StaticActiveEditBriefRepository(EDIT_BRIEF),
    });

    const response = await handler({
      body: {
        workspaceId: "workspace_123",
        projectId: "project_456",
        userId: "user_789",
        sourceAssetId: "asset_abc",
        candidates: [{
          id: "candidate_1",
          startMs: 0,
          endMs: 20_000,
          transcriptText: "A dashboard reveal with a workflow result.",
          baseScore: 70,
        }],
        transcriptSegments: [{
          startMs: 0,
          endMs: 20_000,
          text: "A dashboard reveal with a workflow result.",
        }],
      },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    assert.equal(repository.records.length, 0);
  });

  it("wires the edit decision list endpoint into the API server", async () => {
    const server = createApiServer({
      ...createInMemoryDependencies(),
      adminAuthorizer: createStaticAdminAuthorizer("admin-token-123456"),
    });

    try {
      const baseUrl = await listen(server);
      const response = await fetch(`${baseUrl}/api/edit-decision-lists`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: "workspace_123",
          projectId: "project_456",
          userId: "user_789",
          sourceAssetId: "asset_abc",
          editBrief: EDIT_BRIEF,
          transcriptSegments: [{
            startMs: 0,
            endMs: 20_000,
            text: "A dashboard reveal with a workflow result.",
          }],
        }),
      });
      const body = await response.json();

      assert.equal(response.status, 201);
      assert.equal(body.success, true);
      assert.equal(body.data.decisionList.schemaVersion, "content_ops.edit_decision_list.v1");
    } finally {
      await close(server);
    }
  });
});

class RecordingEditDecisionListRepository implements EditDecisionListRepository {
  records: readonly EditDecisionListRecord[] = [];

  async createEditDecisionList(
    record: EditDecisionListRecord,
  ): Promise<EditDecisionListRecord> {
    this.records = [...this.records, record];
    return record;
  }
}

class StaticActiveEditBriefRepository {
  requests: readonly unknown[] = [];

  constructor(private readonly editBrief: EditPlanningBriefReference | undefined) {}

  async getActiveEditBrief(request: unknown): Promise<EditBriefReadModel | undefined> {
    this.requests = [...this.requests, request];
    return this.editBrief
      ? {
        ...this.editBrief,
        workspaceId: "workspace_123",
        projectId: "project_456",
        userId: "user_789",
      }
      : undefined;
  }
}

class RecordingAnalyticsSink implements ProductAnalyticsSink {
  events: readonly ProductAnalyticsEventPayload[] = [];

  async track(event: ProductAnalyticsEventPayload): Promise<void> {
    this.events = [...this.events, event];
  }
}

async function listen(server: http.Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("server did not bind to a TCP port");
  }

  return `http://127.0.0.1:${address.port}`;
}

async function close(server: http.Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
