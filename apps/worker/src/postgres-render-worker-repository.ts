import type {
  RenderWorkerClaim,
  RenderWorkerRepository,
} from "./render-worker-types";
import type { QueueJobPayload, RenderOutputManifest } from "./payload";

export interface PostgresQueryResult<TRow> {
  rows: TRow[];
}

export interface PostgresQueryClient {
  query<TRow>(text: string, values?: readonly unknown[]): Promise<PostgresQueryResult<TRow>>;
}

interface RenderJobStatusRow {
  id: unknown;
  status: unknown;
}

export class PostgresRenderWorkerRepository implements RenderWorkerRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async markRendering(
    payload: QueueJobPayload,
    _metadata: { workspaceManifestPath: string },
  ): Promise<RenderWorkerClaim> {
    const result = await this.client.query<RenderJobStatusRow>(
      `
        update render_jobs
        set
          status = 'rendering',
          updated_at = now()
        where workspace_id = $1
          and project_id = $2
          and source_asset_id = $3
          and queue_job -> 'payload' = $4::jsonb
          and status = 'render_queued'
        returning id, status
      `,
      [
        payload.workspace_id,
        payload.project_id,
        payload.source_asset_id,
        JSON.stringify(payload),
      ],
    );
    const claimedRow = result.rows[0];

    if (claimedRow) {
      return { renderJobId: requireString(claimedRow.id, "id") };
    }

    const existing = await this.findByPayload(payload);

    if (existing.status === "ready") {
      return {
        renderJobId: existing.id,
        alreadyReady: true,
      };
    }

    if (existing.status === "rendering") {
      return { renderJobId: existing.id };
    }

    throw new Error(`render job is not claimable from status ${existing.status}`);
  }

  async markReady(claim: RenderWorkerClaim, outputManifest: RenderOutputManifest): Promise<void> {
    await this.client.query<RenderJobStatusRow>(
      `
        update render_jobs
        set
          status = 'ready',
          output_manifest = $2::jsonb,
          updated_at = now()
        where id = $1
          and status in ('rendering', 'ready')
        returning id, status
      `,
      [
        claim.renderJobId,
        JSON.stringify(outputManifest),
      ],
    );
  }

  async markFailed(
    payload: QueueJobPayload,
    failure: { code: string; message: string },
  ): Promise<void> {
    await this.client.query<RenderJobStatusRow>(
      `
        update render_jobs
        set
          status = 'failed',
          failure_code = $5,
          failure_message = $6,
          updated_at = now()
        where workspace_id = $1
          and project_id = $2
          and source_asset_id = $3
          and queue_job -> 'payload' = $4::jsonb
          and status in ('render_queued', 'rendering')
        returning id, status
      `,
      [
        payload.workspace_id,
        payload.project_id,
        payload.source_asset_id,
        JSON.stringify(payload),
        failure.code,
        failure.message,
      ],
    );
  }

  private async findByPayload(payload: QueueJobPayload): Promise<{ id: string; status: string }> {
    const result = await this.client.query<RenderJobStatusRow>(
      `
        select id, status
        from render_jobs
        where workspace_id = $1
          and project_id = $2
          and source_asset_id = $3
          and queue_job -> 'payload' = $4::jsonb
        limit 1
      `,
      [
        payload.workspace_id,
        payload.project_id,
        payload.source_asset_id,
        JSON.stringify(payload),
      ],
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("render job not found for worker payload");
    }

    return {
      id: requireString(row.id, "id"),
      status: requireString(row.status, "status"),
    };
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }

  return value;
}
