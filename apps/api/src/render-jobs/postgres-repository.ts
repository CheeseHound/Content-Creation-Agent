import {
  RENDER_JOB_STATUSES,
  SUBSCRIPTION_TIERS,
  type MediaStorageKeys,
  type QueueJob,
  type RenderJobRecord,
  type RenderJobRepository,
  type RenderOutputManifest,
  type RenderJobStatus,
  type SubscriptionTier,
  type UsageSnapshot,
  type WorkspaceSubscription,
} from "./types";

export interface PostgresQueryResult<TRow> {
  rows: TRow[];
}

export interface PostgresQueryClient {
  query<TRow>(text: string, values?: readonly unknown[]): Promise<PostgresQueryResult<TRow>>;
}

interface SubscriptionRow {
  tier: unknown;
}

interface UsageRow {
  active_render_jobs: unknown;
  rendered_minutes_this_period: unknown;
}

interface RenderJobRow {
  id: unknown;
  workspace_id: unknown;
  project_id: unknown;
  user_id: unknown;
  source_asset_id: unknown;
  status: unknown;
  estimated_render_minutes: unknown;
  storage_keys: unknown;
  queue_job: unknown;
  output_manifest: unknown;
}

const ACTIVE_RENDER_JOB_STATUSES: readonly RenderJobStatus[] = [
  "created",
  "uploaded",
  "transcribing",
  "transcribed",
  "render_queued",
  "rendering",
];

export class PostgresRenderJobRepository implements RenderJobRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async getWorkspaceSubscription(workspaceId: string): Promise<WorkspaceSubscription> {
    const result = await this.client.query<SubscriptionRow>(
      `
        select tier
        from subscriptions
        where workspace_id = $1
          and status in ('trialing', 'active')
        order by current_period_end desc nulls last, updated_at desc
        limit 1
      `,
      [workspaceId],
    );
    const row = result.rows[0];

    if (!row) {
      return { tier: "free" };
    }

    return {
      tier: requireSubscriptionTier(row.tier),
    };
  }

  async getUsageSnapshot(workspaceId: string): Promise<UsageSnapshot> {
    const result = await this.client.query<UsageRow>(
      `
        select
          (
            select count(*)
            from render_jobs
            where workspace_id = $1
              and status = any($2::text[])
          ) as active_render_jobs,
          coalesce(
            (
              select sum(render_minutes)
              from usage_ledger
              where workspace_id = $1
                and period_start <= now()
                and period_end > now()
            ),
            0
          ) as rendered_minutes_this_period
      `,
      [workspaceId, [...ACTIVE_RENDER_JOB_STATUSES]],
    );
    const row = result.rows[0];

    return {
      activeRenderJobs: toNonNegativeInteger(row?.active_render_jobs ?? 0, "active_render_jobs"),
      renderedMinutesThisPeriod: toNonNegativeInteger(
        row?.rendered_minutes_this_period ?? 0,
        "rendered_minutes_this_period",
      ),
    };
  }

  async createRenderJob(record: RenderJobRecord): Promise<RenderJobRecord> {
    const result = await this.client.query<RenderJobRow>(
      `
        insert into render_jobs (
          id,
          workspace_id,
          project_id,
          user_id,
          source_asset_id,
          status,
          estimated_render_minutes,
          storage_keys,
          idempotency_key,
          queue_job
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb)
        on conflict (idempotency_key) do update
          set updated_at = render_jobs.updated_at
        returning
          id,
          workspace_id,
          project_id,
          user_id,
          source_asset_id,
          status,
          estimated_render_minutes,
          storage_keys,
          queue_job,
          output_manifest
      `,
      [
        record.id,
        record.workspaceId,
        record.projectId,
        record.userId,
        record.sourceAssetId,
        record.status,
        record.estimatedRenderMinutes,
        JSON.stringify(record.storageKeys),
        record.queueJob.idempotencyKey,
        JSON.stringify(record.queueJob),
      ],
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("render job insert did not return a row");
    }

    return mapRenderJobRow(row);
  }

  async getRenderJobById(id: string): Promise<RenderJobRecord | undefined> {
    const result = await this.client.query<RenderJobRow>(
      `
        select
          id,
          workspace_id,
          project_id,
          user_id,
          source_asset_id,
          status,
          estimated_render_minutes,
          storage_keys,
          queue_job,
          output_manifest
        from render_jobs
        where id = $1
        limit 1
      `,
      [id],
    );
    const row = result.rows[0];

    return row ? mapRenderJobRow(row) : undefined;
  }
}

function mapRenderJobRow(row: RenderJobRow): RenderJobRecord {
  const outputManifest = parseOptionalJsonObject<RenderOutputManifest>(
    row.output_manifest,
    "output_manifest",
  );

  return {
    id: requireString(row.id, "id"),
    workspaceId: requireString(row.workspace_id, "workspace_id"),
    projectId: requireString(row.project_id, "project_id"),
    userId: requireString(row.user_id, "user_id"),
    sourceAssetId: requireString(row.source_asset_id, "source_asset_id"),
    status: requireRenderJobStatus(row.status),
    estimatedRenderMinutes: toNonNegativeInteger(
      row.estimated_render_minutes,
      "estimated_render_minutes",
    ),
    storageKeys: parseJsonObject<MediaStorageKeys>(row.storage_keys, "storage_keys"),
    queueJob: parseJsonObject<QueueJob>(row.queue_job, "queue_job"),
    ...(outputManifest ? { outputManifest } : {}),
  };
}

function parseOptionalJsonObject<TValue>(value: unknown, field: string): TValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return parseJsonObject<TValue>(value, field);
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

function requireSubscriptionTier(value: unknown): SubscriptionTier {
  if (typeof value === "string" && SUBSCRIPTION_TIERS.includes(value as SubscriptionTier)) {
    return value as SubscriptionTier;
  }

  throw new Error("subscription tier is not supported");
}

function requireRenderJobStatus(value: unknown): RenderJobStatus {
  if (typeof value === "string" && RENDER_JOB_STATUSES.includes(value as RenderJobStatus)) {
    return value as RenderJobStatus;
  }

  throw new Error("render job status is not supported");
}

function toNonNegativeInteger(value: unknown, field: string): number {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }

  return numberValue;
}
