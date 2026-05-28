import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PostgresEditDecisionListRepository } from "../src/edit-planning/postgres-repository";
import type { EditDecisionListRecord } from "../src/edit-planning/types";
import type { PostgresQueryClient } from "../src/render-jobs/postgres-repository";

const DECISION_LIST_RECORD: EditDecisionListRecord = {
  id: "edit_decision_list_fixture",
  workspaceId: "workspace_123",
  projectId: "project_456",
  sourceAssetId: "asset_abc",
  editBriefId: "edit_brief_workspace_123_project_456_asset_abc",
  editBriefVersionId: "edit_brief_version_workspace_123_project_456_asset_abc_1",
  idempotencyKey: "edit-decision-list:workspace_123:project_456:asset_abc:fixture",
  decisionList: {
    schemaVersion: "content_ops.edit_decision_list.v1",
    id: "edit_decision_list_fixture",
    workspaceId: "workspace_123",
    projectId: "project_456",
    sourceAssetId: "asset_abc",
    editBriefId: "edit_brief_workspace_123_project_456_asset_abc",
    editBriefVersionId: "edit_brief_version_workspace_123_project_456_asset_abc_1",
    editBriefVersionNumber: 1,
    contentProfile: "product_demo",
    idempotencyKey: "edit-decision-list:workspace_123:project_456:asset_abc:fixture",
    decisions: [{
      clipCandidateId: "candidate_1",
      startMs: 0,
      endMs: 20_000,
      score: 90,
      excluded: false,
      rank: 1,
      reasons: ["Fits requested 10-45 second clip length."],
    }],
  },
};

describe("PostgresEditDecisionListRepository", () => {
  it("persists decision lists with idempotency and no raw transcript columns", async () => {
    const client = new FakePgClient([[toRow(DECISION_LIST_RECORD)]]);
    const repository = new PostgresEditDecisionListRepository(client);

    const created = await repository.createEditDecisionList(DECISION_LIST_RECORD);

    assert.deepEqual(created, DECISION_LIST_RECORD);
    assert.equal(client.queries.length, 1);
    assert.match(client.queries[0]?.text ?? "", /insert into edit_decision_lists/i);
    assert.match(client.queries[0]?.text ?? "", /on conflict \(idempotency_key\)/i);
    assert.doesNotMatch(client.queries[0]?.text ?? "", /transcript/i);
    assert.ok(client.queries[0]?.values.includes(JSON.stringify(DECISION_LIST_RECORD.decisionList)));
  });
});

function toRow(record: EditDecisionListRecord) {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    project_id: record.projectId,
    source_asset_id: record.sourceAssetId,
    edit_brief_id: record.editBriefId,
    edit_brief_version_id: record.editBriefVersionId,
    decision_list: record.decisionList,
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
