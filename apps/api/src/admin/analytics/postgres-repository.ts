import type { PostgresQueryClient } from "../../render-jobs/postgres-repository";
import {
  RENDER_JOB_STATUSES,
  SUBSCRIPTION_TIERS,
  type RenderJobStatus,
  type SubscriptionTier,
} from "../../render-jobs/types";
import type {
  AdminAnalyticsRepository,
  AdminAnalyticsSummary,
  AdminAnalyticsSummaryRequest,
} from "./types";

interface WorkspaceTotalRow {
  total_workspaces: unknown;
}

interface WorkspaceTierRow {
  tier: unknown;
  workspace_count: unknown;
}

interface UploadSummaryRow {
  upload_count: unknown;
  total_bytes: unknown;
}

interface EditBriefSummaryRow {
  brief_count: unknown;
  version_count: unknown;
}

interface DecisionListSummaryRow {
  decision_list_count: unknown;
}

interface RenderJobStatusRow {
  status: unknown;
  job_count: unknown;
  estimated_minutes: unknown;
}

interface TimingSummaryRow {
  measured_jobs: unknown;
  average_seconds: unknown;
  p95_seconds: unknown;
  max_seconds: unknown;
}

interface FailureCodeRow {
  failure_code: unknown;
  failure_count: unknown;
}

interface UsageSummaryRow {
  render_minutes: unknown;
}

interface UsageReconciliationRow {
  ready_render_jobs: unknown;
  ledgered_render_jobs: unknown;
  unledgered_ready_render_jobs: unknown;
  estimated_ready_render_minutes: unknown;
  ledgered_ready_render_minutes: unknown;
  variance_render_minutes: unknown;
}

interface StorageOutputSummaryRow {
  output_count: unknown;
  total_output_bytes: unknown;
}

export class PostgresAdminAnalyticsRepository implements AdminAnalyticsRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async getSummary(request: AdminAnalyticsSummaryRequest): Promise<AdminAnalyticsSummary> {
    const values = [request.workspaceId ?? null, request.start, request.end] as const;
    const [
      workspaceTotalResult,
      workspaceTierResult,
      uploadResult,
      editBriefResult,
      decisionListResult,
      renderStatusResult,
      queueLatencyResult,
      renderDurationResult,
      failureCodeResult,
      usageResult,
      usageReconciliationResult,
      storageOutputResult,
    ] = await Promise.all([
      this.client.query<WorkspaceTotalRow>(
        `
          select count(*) as total_workspaces
          from workspaces
          where ($1::text is null or id = $1)
            and created_at < $3
        `,
        values,
      ),
      this.client.query<WorkspaceTierRow>(
        `
          select tier, count(distinct workspace_id) as workspace_count
          from subscriptions
          where ($1::text is null or workspace_id = $1)
            and created_at < $3
            and status in ('trialing', 'active')
          group by tier
        `,
        values,
      ),
      this.client.query<UploadSummaryRow>(
        `
          select
            count(*) as upload_count,
            coalesce(sum(size_bytes), 0) as total_bytes
          from media_assets
          where ($1::text is null or workspace_id = $1)
            and created_at >= $2
            and created_at < $3
        `,
        values,
      ),
      this.client.query<EditBriefSummaryRow>(
        `
          select
            count(distinct edit_brief_id) as brief_count,
            count(*) as version_count
          from edit_brief_versions
          where ($1::text is null or workspace_id = $1)
            and created_at >= $2
            and created_at < $3
        `,
        values,
      ),
      this.client.query<DecisionListSummaryRow>(
        `
          select count(*) as decision_list_count
          from edit_decision_lists
          where ($1::text is null or workspace_id = $1)
            and created_at >= $2
            and created_at < $3
        `,
        values,
      ),
      this.client.query<RenderJobStatusRow>(
        `
          select
            status,
            count(*) as job_count,
            coalesce(sum(estimated_render_minutes), 0) as estimated_minutes
          from render_jobs
          where ($1::text is null or workspace_id = $1)
            and created_at >= $2
            and created_at < $3
          group by status
        `,
        values,
      ),
      this.client.query<TimingSummaryRow>(
        `
          select
            count(*) as measured_jobs,
            coalesce(floor(avg(greatest(extract(epoch from render_started_at - created_at), 0)))::bigint, 0) as average_seconds,
            coalesce(floor(percentile_cont(0.95) within group (
              order by greatest(extract(epoch from render_started_at - created_at), 0)
            ))::bigint, 0) as p95_seconds,
            coalesce(floor(max(greatest(extract(epoch from render_started_at - created_at), 0)))::bigint, 0) as max_seconds
          from render_jobs
          where ($1::text is null or workspace_id = $1)
            and created_at >= $2
            and created_at < $3
            and render_started_at is not null
        `,
        values,
      ),
      this.client.query<TimingSummaryRow>(
        `
          select
            count(*) as measured_jobs,
            coalesce(floor(avg(greatest(extract(epoch from render_completed_at - render_started_at), 0)))::bigint, 0) as average_seconds,
            coalesce(floor(percentile_cont(0.95) within group (
              order by greatest(extract(epoch from render_completed_at - render_started_at), 0)
            ))::bigint, 0) as p95_seconds,
            coalesce(floor(max(greatest(extract(epoch from render_completed_at - render_started_at), 0)))::bigint, 0) as max_seconds
          from render_jobs
          where ($1::text is null or workspace_id = $1)
            and created_at >= $2
            and created_at < $3
            and render_started_at is not null
            and render_completed_at is not null
        `,
        values,
      ),
      this.client.query<FailureCodeRow>(
        `
          select
            coalesce(failure_code, 'unknown') as failure_code,
            count(*) as failure_count
          from render_jobs
          where ($1::text is null or workspace_id = $1)
            and created_at >= $2
            and created_at < $3
            and status = 'failed'
          group by coalesce(failure_code, 'unknown')
          order by failure_count desc, failure_code asc
          limit 10
        `,
        values,
      ),
      this.client.query<UsageSummaryRow>(
        `
          select coalesce(sum(render_minutes), 0) as render_minutes
          from usage_ledger
          where ($1::text is null or workspace_id = $1)
            and created_at >= $2
            and created_at < $3
        `,
        values,
      ),
      this.client.query<UsageReconciliationRow>(
        `
          with ledger_by_job as (
            select
              render_job_id,
              sum(render_minutes) as ledgered_render_minutes
            from usage_ledger
            where ($1::text is null or workspace_id = $1)
              and created_at >= $2
              and created_at < $3
              and render_job_id is not null
            group by render_job_id
          ),
          ready_jobs as (
            select
              r.id,
              r.estimated_render_minutes,
              l.render_job_id is not null as has_ledger,
              coalesce(l.ledgered_render_minutes, 0) as ledgered_render_minutes
            from render_jobs r
            left join ledger_by_job l on l.render_job_id = r.id
            where ($1::text is null or r.workspace_id = $1)
              and r.created_at >= $2
              and r.created_at < $3
              and r.status = 'ready'
          )
          select
            count(*) as ready_render_jobs,
            count(*) filter (where has_ledger) as ledgered_render_jobs,
            count(*) filter (where not has_ledger) as unledgered_ready_render_jobs,
            coalesce(sum(estimated_render_minutes), 0) as estimated_ready_render_minutes,
            coalesce(sum(ledgered_render_minutes), 0) as ledgered_ready_render_minutes,
            abs(
              coalesce(sum(estimated_render_minutes), 0)
              - coalesce(sum(ledgered_render_minutes), 0)
            ) as variance_render_minutes
          from ready_jobs
        `,
        values,
      ),
      this.client.query<StorageOutputSummaryRow>(
        `
          select
            count(output_asset.value) as output_count,
            coalesce(sum(
              case
                when output_asset.value ? 'sizeBytes'
                  and output_asset.value->>'sizeBytes' ~ '^[0-9]+$'
                then (output_asset.value->>'sizeBytes')::bigint
                else 0
              end
            ), 0) as total_output_bytes
          from render_jobs
          left join lateral jsonb_array_elements(
            case
              when jsonb_typeof(output_manifest->'outputs') = 'array'
              then output_manifest->'outputs'
              else '[]'::jsonb
            end
          ) as output_asset(value) on true
          where ($1::text is null or workspace_id = $1)
            and created_at >= $2
            and created_at < $3
        `,
        values,
      ),
    ]);
    const renderJobStatus = buildRenderStatusSummary(renderStatusResult.rows);

    return {
      generatedAt: request.generatedAt.toISOString(),
      window: {
        start: request.start.toISOString(),
        end: request.end.toISOString(),
      },
      ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
      workspaces: {
        total: toNonNegativeInteger(
          workspaceTotalResult.rows[0]?.total_workspaces ?? 0,
          "total_workspaces",
        ),
        byTier: buildTierCounts(workspaceTierResult.rows),
      },
      uploads: {
        count: toNonNegativeInteger(uploadResult.rows[0]?.upload_count ?? 0, "upload_count"),
        totalBytes: toNonNegativeInteger(uploadResult.rows[0]?.total_bytes ?? 0, "total_bytes"),
      },
      editBriefs: {
        briefCount: toNonNegativeInteger(
          editBriefResult.rows[0]?.brief_count ?? 0,
          "brief_count",
        ),
        versionCount: toNonNegativeInteger(
          editBriefResult.rows[0]?.version_count ?? 0,
          "version_count",
        ),
      },
      decisionLists: {
        count: toNonNegativeInteger(
          decisionListResult.rows[0]?.decision_list_count ?? 0,
          "decision_list_count",
        ),
      },
      renderJobs: {
        ...renderJobStatus,
        successRate: renderJobStatus.total === 0
          ? 0
          : renderJobStatus.byStatus.ready / renderJobStatus.total,
        queueLatency: mapTimingSummary(queueLatencyResult.rows[0], "queue_latency"),
        renderDuration: mapTimingSummary(renderDurationResult.rows[0], "render_duration"),
        failureCodes: failureCodeResult.rows.map((row) => ({
          code: requireString(row.failure_code, "failure_code"),
          count: toNonNegativeInteger(row.failure_count, "failure_count"),
        })),
      },
      usage: {
        renderMinutes: toNonNegativeInteger(
          usageResult.rows[0]?.render_minutes ?? 0,
          "render_minutes",
        ),
        reconciliation: mapUsageReconciliation(usageReconciliationResult.rows[0]),
      },
      storage: {
        outputCount: toNonNegativeInteger(
          storageOutputResult.rows[0]?.output_count ?? 0,
          "output_count",
        ),
        totalOutputBytes: toNonNegativeInteger(
          storageOutputResult.rows[0]?.total_output_bytes ?? 0,
          "total_output_bytes",
        ),
      },
    };
  }
}

function mapTimingSummary(row: TimingSummaryRow | undefined, field: string) {
  return {
    measuredJobs: toNonNegativeInteger(row?.measured_jobs ?? 0, `${field}.measured_jobs`),
    averageSeconds: toNonNegativeInteger(row?.average_seconds ?? 0, `${field}.average_seconds`),
    p95Seconds: toNonNegativeInteger(row?.p95_seconds ?? 0, `${field}.p95_seconds`),
    maxSeconds: toNonNegativeInteger(row?.max_seconds ?? 0, `${field}.max_seconds`),
  };
}

function mapUsageReconciliation(row: UsageReconciliationRow | undefined) {
  return {
    readyRenderJobs: toNonNegativeInteger(
      row?.ready_render_jobs ?? 0,
      "ready_render_jobs",
    ),
    ledgeredRenderJobs: toNonNegativeInteger(
      row?.ledgered_render_jobs ?? 0,
      "ledgered_render_jobs",
    ),
    unledgeredReadyRenderJobs: toNonNegativeInteger(
      row?.unledgered_ready_render_jobs ?? 0,
      "unledgered_ready_render_jobs",
    ),
    estimatedReadyRenderMinutes: toNonNegativeInteger(
      row?.estimated_ready_render_minutes ?? 0,
      "estimated_ready_render_minutes",
    ),
    ledgeredReadyRenderMinutes: toNonNegativeInteger(
      row?.ledgered_ready_render_minutes ?? 0,
      "ledgered_ready_render_minutes",
    ),
    varianceRenderMinutes: toNonNegativeInteger(
      row?.variance_render_minutes ?? 0,
      "variance_render_minutes",
    ),
  };
}

function buildTierCounts(rows: readonly WorkspaceTierRow[]): Record<SubscriptionTier, number> {
  const counts = Object.fromEntries(SUBSCRIPTION_TIERS.map((tier) => [tier, 0])) as Record<
    SubscriptionTier,
    number
  >;

  for (const row of rows) {
    counts[requireSubscriptionTier(row.tier)] = toNonNegativeInteger(
      row.workspace_count,
      "workspace_count",
    );
  }

  return counts;
}

function buildRenderStatusSummary(rows: readonly RenderJobStatusRow[]) {
  const byStatus = Object.fromEntries(RENDER_JOB_STATUSES.map((status) => [status, 0])) as Record<
    RenderJobStatus,
    number
  >;
  let estimatedRenderMinutes = 0;

  for (const row of rows) {
    const status = requireRenderJobStatus(row.status);
    byStatus[status] = toNonNegativeInteger(row.job_count, "job_count");
    estimatedRenderMinutes += toNonNegativeInteger(row.estimated_minutes, "estimated_minutes");
  }

  return {
    total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
    byStatus,
    estimatedRenderMinutes,
  };
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

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }

  return value;
}

function toNonNegativeInteger(value: unknown, field: string): number {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }

  return numberValue;
}
