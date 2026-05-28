import type { PostgresQueryClient } from "../render-jobs/postgres-repository";
import type {
  EditDecisionList,
  EditDecisionListRecord,
  EditDecisionListRepository,
} from "./types";

interface EditDecisionListRow {
  id: unknown;
  workspace_id: unknown;
  project_id: unknown;
  source_asset_id: unknown;
  edit_brief_id: unknown;
  edit_brief_version_id: unknown;
  decision_list: unknown;
  idempotency_key: unknown;
}

export class PostgresEditDecisionListRepository implements EditDecisionListRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async createEditDecisionList(
    record: EditDecisionListRecord,
  ): Promise<EditDecisionListRecord> {
    const result = await this.client.query<EditDecisionListRow>(
      `
        insert into edit_decision_lists (
          id,
          workspace_id,
          project_id,
          source_asset_id,
          edit_brief_id,
          edit_brief_version_id,
          schema_version,
          decision_list,
          idempotency_key
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
        on conflict (idempotency_key) do update
          set decision_list = edit_decision_lists.decision_list
        returning
          id,
          workspace_id,
          project_id,
          source_asset_id,
          edit_brief_id,
          edit_brief_version_id,
          decision_list,
          idempotency_key
      `,
      [
        record.id,
        record.workspaceId,
        record.projectId,
        record.sourceAssetId,
        record.editBriefId,
        record.editBriefVersionId,
        record.decisionList.schemaVersion,
        JSON.stringify(record.decisionList),
        record.idempotencyKey,
      ],
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("edit decision list insert did not return a row");
    }

    return mapEditDecisionListRow(row);
  }
}

function mapEditDecisionListRow(row: EditDecisionListRow): EditDecisionListRecord {
  return {
    id: requireString(row.id, "id"),
    workspaceId: requireString(row.workspace_id, "workspace_id"),
    projectId: requireString(row.project_id, "project_id"),
    sourceAssetId: requireString(row.source_asset_id, "source_asset_id"),
    editBriefId: requireString(row.edit_brief_id, "edit_brief_id"),
    editBriefVersionId: requireString(row.edit_brief_version_id, "edit_brief_version_id"),
    decisionList: parseJsonObject<EditDecisionList>(row.decision_list, "decision_list"),
    idempotencyKey: requireString(row.idempotency_key, "idempotency_key"),
  };
}

function parseJsonObject<TValue>(value: unknown, field: string): TValue {
  const parsedValue = typeof value === "string" ? JSON.parse(value) as unknown : value;

  if (typeof parsedValue !== "object" || parsedValue === null || Array.isArray(parsedValue)) {
    throw new Error(`${field} must be a JSON object`);
  }

  return parsedValue as TValue;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }

  return value;
}
