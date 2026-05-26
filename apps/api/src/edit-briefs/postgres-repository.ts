import type {
  ActiveEditBriefLookupRequest,
  EditBriefReadModel,
  EditBriefRepository,
  EditBriefSettings,
  EditBriefVersionRecord,
} from "./types";

export interface PostgresQueryResult<TRow> {
  rows: TRow[];
}

export interface PostgresQueryClient {
  query<TRow>(text: string, values?: readonly unknown[]): Promise<PostgresQueryResult<TRow>>;
}

interface EditBriefVersionRow {
  id: unknown;
  edit_brief_id: unknown;
  workspace_id: unknown;
  project_id: unknown;
  user_id: unknown;
  source_asset_id: unknown;
  version_number: unknown;
  settings: unknown;
  idempotency_key: unknown;
}

export class PostgresEditBriefRepository implements EditBriefRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async getActiveEditBrief(
    request: ActiveEditBriefLookupRequest,
  ): Promise<EditBriefReadModel | undefined> {
    const result = await this.client.query<EditBriefVersionRow>(
      `
        select
          edit_brief_versions.id,
          edit_brief_versions.edit_brief_id,
          edit_brief_versions.workspace_id,
          edit_brief_versions.project_id,
          edit_brief_versions.user_id,
          edit_brief_versions.source_asset_id,
          edit_brief_versions.version_number,
          edit_brief_versions.settings,
          edit_brief_versions.idempotency_key
        from edit_briefs
        join edit_brief_versions
          on edit_brief_versions.edit_brief_id = edit_briefs.id
          and edit_brief_versions.version_number = edit_briefs.active_version_number
        where edit_briefs.workspace_id = $1
          and edit_briefs.project_id = $2
          and (
            ($3::text is not null and edit_briefs.source_asset_id = $3)
            or edit_briefs.source_asset_id is null
          )
        order by
          case when edit_briefs.source_asset_id = $3 then 0 else 1 end,
          edit_briefs.updated_at desc
        limit 1
      `,
      [
        request.workspaceId,
        request.projectId,
        request.sourceAssetId ?? null,
      ],
    );
    const row = result.rows[0];

    return row ? mapEditBriefReadModel(row) : undefined;
  }

  async createEditBriefVersion(record: EditBriefVersionRecord): Promise<EditBriefVersionRecord> {
    const result = await this.client.query<EditBriefVersionRow>(
      `
        with brief as (
          insert into edit_briefs (
            id,
            workspace_id,
            project_id,
            user_id,
            source_asset_id
          )
          values ($1, $2, $3, $4, $5)
          on conflict (id) do update
            set
              user_id = excluded.user_id,
              updated_at = now()
          returning id
        ),
        next_version as (
          select coalesce(max(version_number), 0) + 1 as version_number
          from edit_brief_versions
          where edit_brief_id = $1
        ),
        inserted_version as (
          insert into edit_brief_versions (
            id,
            edit_brief_id,
            workspace_id,
            project_id,
            user_id,
            source_asset_id,
            version_number,
            schema_version,
            settings,
            idempotency_key
          )
          select
            $6,
            $1,
            $2,
            $3,
            $4,
            $5,
            next_version.version_number,
            $7,
            $8::jsonb,
            $9
          from next_version
          on conflict (idempotency_key) do update
            set idempotency_key = edit_brief_versions.idempotency_key
          returning
            id,
            edit_brief_id,
            workspace_id,
            project_id,
            user_id,
            source_asset_id,
            version_number,
            settings,
            idempotency_key
        ),
        active_brief as (
          update edit_briefs
          set
            active_version_number = inserted_version.version_number,
            updated_at = now()
          from inserted_version
          where edit_briefs.id = inserted_version.edit_brief_id
          returning edit_briefs.id
        )
        select
          id,
          edit_brief_id,
          workspace_id,
          project_id,
          user_id,
          source_asset_id,
          version_number,
          settings,
          idempotency_key
        from inserted_version
      `,
      [
        record.editBriefId,
        record.workspaceId,
        record.projectId,
        record.userId,
        record.sourceAssetId ?? null,
        record.id,
        record.settings.schemaVersion,
        JSON.stringify(record.settings),
        record.idempotencyKey,
      ],
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("edit brief insert did not return a row");
    }

    return mapEditBriefVersionRow(row);
  }
}

function mapEditBriefReadModel(row: EditBriefVersionRow): EditBriefReadModel {
  return {
    id: requireString(row.edit_brief_id, "edit_brief_id"),
    versionId: requireString(row.id, "id"),
    workspaceId: requireString(row.workspace_id, "workspace_id"),
    projectId: requireString(row.project_id, "project_id"),
    userId: requireString(row.user_id, "user_id"),
    ...(row.source_asset_id ? { sourceAssetId: requireString(row.source_asset_id, "source_asset_id") } : {}),
    versionNumber: toPositiveInteger(row.version_number, "version_number"),
    settings: parseJsonObject<EditBriefSettings>(row.settings, "settings"),
  };
}

function mapEditBriefVersionRow(row: EditBriefVersionRow): EditBriefVersionRecord {
  return {
    id: requireString(row.id, "id"),
    editBriefId: requireString(row.edit_brief_id, "edit_brief_id"),
    workspaceId: requireString(row.workspace_id, "workspace_id"),
    projectId: requireString(row.project_id, "project_id"),
    userId: requireString(row.user_id, "user_id"),
    ...(row.source_asset_id ? { sourceAssetId: requireString(row.source_asset_id, "source_asset_id") } : {}),
    versionNumber: toPositiveInteger(row.version_number, "version_number"),
    settings: parseJsonObject<EditBriefSettings>(row.settings, "settings"),
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

function toPositiveInteger(value: unknown, field: string): number {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw new Error(`${field} must be a positive integer`);
  }

  return numberValue;
}
