import http, { type IncomingMessage, type ServerResponse } from "node:http";

import { PostgresAdminAnalyticsRepository } from "./admin/analytics/postgres-repository";
import { createAdminAnalyticsSummaryHandler } from "./admin/analytics/route";
import type {
  AdminAnalyticsDependencies,
  AdminAnalyticsSummary,
} from "./admin/analytics/types";
import { createStaticAdminAuthorizer, type AdminAuthorizer } from "./admin/auth";
import { createNoopProductAnalyticsSink } from "./analytics/sinks";
import type { ProductAnalyticsSink } from "./analytics/types";
import { apiError, type HttpResponse } from "./api-response";
import { loadMigrations, runMigrations } from "./db/migrations";
import {
  createPostgresClient,
  type ManagedPostgresClient,
} from "./db/postgres-client";
import { PostgresEditBriefRepository } from "./edit-briefs/postgres-repository";
import { createEditBriefHandler } from "./edit-briefs/route";
import type {
  CreateEditBriefDependencies,
  EditBriefReadModel,
  EditBriefVersionRecord,
} from "./edit-briefs/types";
import { PostgresObservabilityRepository } from "./observability/postgres-repository";
import { createHealthzHandler, createReadyzHandler } from "./observability/route";
import {
  createConfiguredStorageHealthCheck,
} from "./observability/service";
import type {
  DatabaseHealthReport,
  ObservabilityDependencies,
  QueueHealthCheck,
  QueueHealthReport,
} from "./observability/types";
import { createBullMqRenderQueue } from "./queue/bullmq-render-queue";
import { DEFAULT_RENDER_QUEUE } from "./render-jobs/contract";
import { PostgresRenderJobRepository } from "./render-jobs/postgres-repository";
import { createGetRenderJobHandler, createRenderJobHandler } from "./render-jobs/route";
import { createS3UploadSigner, type S3UploadSignerConfig } from "./storage/s3-upload-signer";
import { PostgresUploadRepository } from "./uploads/postgres-repository";
import { createUploadPresignHandler } from "./uploads/route";
import type {
  CreateUploadPresignDependencies,
  MediaAssetRecord,
  UploadSigner,
} from "./uploads/types";
import type {
  CreateRenderJobDependencies,
  CreateRenderJobResult,
  DownloadSigner,
  DownloadSignerRequest,
  QueueJob,
  RenderJobRecord,
  RenderJobRepository,
  RenderQueue,
  UsageSnapshot,
  WorkspaceSubscription,
} from "./render-jobs/types";

export interface ApiServerDependencies
  extends CreateRenderJobDependencies,
    CreateUploadPresignDependencies,
    CreateEditBriefDependencies,
    AdminAnalyticsDependencies,
    ObservabilityDependencies {}

export interface ApiRuntimeDependencies extends ApiServerDependencies {
  close(): Promise<void>;
}

export interface CreatePostgresDependenciesOptions {
  databaseUrl: string;
  redisUrl: string;
  storage?: S3UploadSignerConfig;
  runMigrations?: boolean;
  client?: ManagedPostgresClient;
  migrationsDirectory?: string;
  queue?: RenderQueue & { close?: () => Promise<void> };
  signer?: UploadSigner & DownloadSigner;
  analyticsSink?: ProductAnalyticsSink;
  adminToken: string;
  uploadTtlSeconds?: number;
  outputDownloadTtlSeconds?: number;
}

export function createApiServer(dependencies: ApiServerDependencies): http.Server {
  const renderJobHandler = createRenderJobHandler(dependencies);
  const getRenderJobHandler = createGetRenderJobHandler(dependencies);
  const uploadPresignHandler = createUploadPresignHandler(dependencies);
  const editBriefHandler = createEditBriefHandler(dependencies);
  const adminAnalyticsSummaryHandler = createAdminAnalyticsSummaryHandler(dependencies);
  const healthzHandler = createHealthzHandler(dependencies);
  const readyzHandler = createReadyzHandler(dependencies);

  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && url.pathname === "/healthz") {
      writeJson(response, healthzHandler());
      return;
    }

    if (request.method === "GET" && url.pathname === "/readyz") {
      writeJson(response, await readyzHandler());
      return;
    }

    if (request.method === "GET" && url.pathname === "/internal/admin/analytics/summary") {
      const routeResponse = await adminAnalyticsSummaryHandler({
        headers: normalizeHeaders(request.headers),
        query: url.searchParams,
      });
      writeJson(response, routeResponse);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/uploads/presign") {
      const body = await readJsonBody(request);
      const routeResponse = await uploadPresignHandler({ body });
      writeJson(response, routeResponse);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/render-jobs") {
      const body = await readJsonBody(request);
      const routeResponse = await renderJobHandler({ body });
      writeJson(response, routeResponse);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/edit-briefs") {
      const body = await readJsonBody(request);
      const routeResponse = await editBriefHandler({ body });
      writeJson(response, routeResponse);
      return;
    }

    const renderJobId = extractRenderJobId(url.pathname);
    if (request.method === "GET" && renderJobId) {
      const routeResponse = await getRenderJobHandler({ params: { id: renderJobId } });
      writeJson(response, routeResponse);
      return;
    }

    writeJson(response, apiError(404, "not_found", "Route not found."));
  });
}

export function createInMemoryDependencies(): ApiServerDependencies {
  const repository = new InMemoryRenderJobRepository();
  const queue = new InMemoryRenderQueue();

  return {
    repository,
    queue,
    analyticsSink: createNoopProductAnalyticsSink(),
    databaseHealthRepository: repository,
    adminAnalyticsRepository: repository,
    adminAuthorizer: createStaticAdminAuthorizer("local-admin-token-123"),
    queueHealthCheck: resolveQueueHealthCheck(queue),
    storageHealthCheck: createConfiguredStorageHealthCheck("local"),
    outputSigner: new InMemoryDownloadSigner(),
    activeEditBriefRepository: repository,
    uploadRepository: repository,
    signer: new InMemoryUploadSigner(),
    editBriefRepository: repository,
  };
}

export async function createPostgresDependencies({
  databaseUrl,
  redisUrl,
  storage,
  runMigrations: shouldRunMigrations = true,
  client: providedClient,
  migrationsDirectory,
  queue: providedQueue,
  signer: providedSigner,
  analyticsSink,
  adminToken,
  uploadTtlSeconds,
  outputDownloadTtlSeconds,
}: CreatePostgresDependenciesOptions): Promise<ApiRuntimeDependencies> {
  const client = providedClient ?? createPostgresClient(databaseUrl);
  const queue = providedQueue ?? createBullMqRenderQueue({
    redisUrl,
    queueName: DEFAULT_RENDER_QUEUE,
  });
  const signer = providedSigner ?? createRequiredS3UploadSigner(storage);

  try {
    if (shouldRunMigrations) {
      await runMigrations({
        client,
        migrations: loadMigrations(migrationsDirectory),
      });
    }
  } catch (error) {
    if (!providedClient) {
      await client.close();
    }
    if (!providedQueue) {
      await queue.close?.();
    }

    throw error;
  }

  const editBriefRepository = new PostgresEditBriefRepository(client);
  const observabilityRepository = new PostgresObservabilityRepository(client);
  const adminAnalyticsRepository = new PostgresAdminAnalyticsRepository(client);

  return {
    repository: new PostgresRenderJobRepository(client),
    queue,
    analyticsSink: analyticsSink ?? createNoopProductAnalyticsSink(),
    databaseHealthRepository: observabilityRepository,
    adminAnalyticsRepository,
    adminAuthorizer: createStaticAdminAuthorizer(adminToken),
    queueHealthCheck: resolveQueueHealthCheck(queue),
    storageHealthCheck: createConfiguredStorageHealthCheck("s3_compatible"),
    outputSigner: signer,
    activeEditBriefRepository: editBriefRepository,
    uploadRepository: new PostgresUploadRepository(client),
    signer,
    editBriefRepository,
    uploadTtlSeconds,
    outputDownloadTtlSeconds,
    async close(): Promise<void> {
      const closeQueue = queue.close?.() ?? Promise.resolve();
      await Promise.all([client.close(), closeQueue]);
    },
  };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  let chunks: Buffer[] = [];

  for await (const chunk of request) {
    const nextChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks = [...chunks, nextChunk];
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (_error) {
    return undefined;
  }
}

function writeJson<TData>(response: ServerResponse, routeResponse: HttpResponse<TData>): void {
  response.statusCode = routeResponse.status;
  response.setHeader("content-type", "application/json; charset=utf-8");

  for (const [name, value] of Object.entries(routeResponse.headers ?? {})) {
    response.setHeader(name, value);
  }

  response.end(JSON.stringify(routeResponse.body));
}

function normalizeHeaders(headers: IncomingMessage["headers"]): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [
    name.toLowerCase(),
    Array.isArray(value) ? value.join(",") : value,
  ]));
}

class InMemoryRenderJobRepository implements RenderJobRepository {
  private readonly subscription: WorkspaceSubscription = { tier: "creator" };
  private readonly usage: UsageSnapshot = { activeRenderJobs: 0, renderedMinutesThisPeriod: 0 };
  private jobsById: ReadonlyMap<string, RenderJobRecord> = new Map();
  private mediaAssetsById: ReadonlyMap<string, MediaAssetRecord> = new Map();
  private editBriefsById: ReadonlyMap<string, readonly EditBriefVersionRecord[]> = new Map();

  async getWorkspaceSubscription(_workspaceId: string): Promise<WorkspaceSubscription> {
    return this.subscription;
  }

  async getUsageSnapshot(_workspaceId: string): Promise<UsageSnapshot> {
    return this.usage;
  }

  async getDatabaseHealth(): Promise<DatabaseHealthReport> {
    return {
      status: "ok",
      connection: { status: "ok" },
      migrations: {
        status: "ok",
        applied: ["in_memory"],
      },
      tables: [
        {
          name: "render_jobs",
          status: "ok",
          approximateRowCount: this.jobsById.size,
        },
        {
          name: "media_assets",
          status: "ok",
          approximateRowCount: this.mediaAssetsById.size,
        },
        {
          name: "edit_briefs",
          status: "ok",
          approximateRowCount: this.editBriefsById.size,
        },
      ],
    };
  }

  async getSummary(request: {
    workspaceId?: string;
    start: Date;
    end: Date;
    generatedAt: Date;
  }): Promise<AdminAnalyticsSummary> {
    const jobs = [...this.jobsById.values()].filter((job) =>
      !request.workspaceId || job.workspaceId === request.workspaceId,
    );
    const uploads = [...this.mediaAssetsById.values()].filter((asset) =>
      !request.workspaceId || asset.workspaceId === request.workspaceId,
    );

    return {
      generatedAt: request.generatedAt.toISOString(),
      window: {
        start: request.start.toISOString(),
        end: request.end.toISOString(),
      },
      ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
      workspaces: {
        total: request.workspaceId ? 1 : 0,
        byTier: {
          creator: request.workspaceId ? 1 : 0,
          free: 0,
          studio: 0,
        },
      },
      uploads: {
        count: uploads.length,
        totalBytes: uploads.reduce((sum, asset) => sum + asset.sizeBytes, 0),
      },
      editBriefs: {
        briefCount: this.editBriefsById.size,
        versionCount: [...this.editBriefsById.values()]
          .reduce((sum, versions) => sum + versions.length, 0),
      },
      decisionLists: {
        count: 0,
      },
      renderJobs: {
        total: jobs.length,
        byStatus: {
          canceled: jobs.filter((job) => job.status === "canceled").length,
          created: jobs.filter((job) => job.status === "created").length,
          failed: jobs.filter((job) => job.status === "failed").length,
          ready: jobs.filter((job) => job.status === "ready").length,
          render_queued: jobs.filter((job) => job.status === "render_queued").length,
          rendering: jobs.filter((job) => job.status === "rendering").length,
          transcribed: jobs.filter((job) => job.status === "transcribed").length,
          transcribing: jobs.filter((job) => job.status === "transcribing").length,
          uploaded: jobs.filter((job) => job.status === "uploaded").length,
        },
        successRate: jobs.length === 0
          ? 0
          : jobs.filter((job) => job.status === "ready").length / jobs.length,
        estimatedRenderMinutes: jobs.reduce(
          (sum, job) => sum + job.estimatedRenderMinutes,
          0,
        ),
        failureCodes: [],
      },
      usage: {
        renderMinutes: this.usage.renderedMinutesThisPeriod,
      },
      storage: {
        outputCount: jobs.reduce(
          (sum, job) => sum + (job.outputManifest?.outputs.length ?? 0),
          0,
        ),
        totalOutputBytes: jobs.reduce(
          (sum, job) => sum + (job.outputManifest?.outputs ?? [])
            .reduce((outputSum, output) => outputSum + (output.sizeBytes ?? 0), 0),
          0,
        ),
      },
    };
  }

  async createRenderJob(record: RenderJobRecord): Promise<RenderJobRecord> {
    this.jobsById = new Map([...this.jobsById.entries(), [record.id, record]]);
    return record;
  }

  async getRenderJobById(id: string): Promise<RenderJobRecord | undefined> {
    return this.jobsById.get(id);
  }

  async createMediaAsset(record: MediaAssetRecord): Promise<MediaAssetRecord> {
    this.mediaAssetsById = new Map([...this.mediaAssetsById.entries(), [record.id, record]]);
    return record;
  }

  async createEditBriefVersion(record: EditBriefVersionRecord): Promise<EditBriefVersionRecord> {
    const versions = this.editBriefsById.get(record.editBriefId) ?? [];
    const createdRecord = {
      ...record,
      versionNumber: versions.length + 1,
    };

    this.editBriefsById = new Map([
      ...this.editBriefsById.entries(),
      [record.editBriefId, [...versions, createdRecord]],
    ]);
    return createdRecord;
  }

  async getActiveEditBrief(request: {
    workspaceId: string;
    projectId: string;
    sourceAssetId?: string;
  }): Promise<EditBriefReadModel | undefined> {
    const versions = [...this.editBriefsById.values()].flat();
    const matchingVersions = versions.filter((version) =>
      version.workspaceId === request.workspaceId &&
      version.projectId === request.projectId,
    );
    const sourceSpecificVersion = matchingVersions
      .filter((version) => version.sourceAssetId === request.sourceAssetId)
      .at(-1);
    const projectVersion = matchingVersions
      .filter((version) => version.sourceAssetId === undefined)
      .at(-1);
    const activeVersion = sourceSpecificVersion ?? projectVersion;

    if (!activeVersion) {
      return undefined;
    }

    return {
      id: activeVersion.editBriefId,
      versionId: activeVersion.id,
      workspaceId: activeVersion.workspaceId,
      projectId: activeVersion.projectId,
      userId: activeVersion.userId,
      ...(activeVersion.sourceAssetId ? { sourceAssetId: activeVersion.sourceAssetId } : {}),
      versionNumber: activeVersion.versionNumber,
      settings: activeVersion.settings,
    };
  }
}

class InMemoryRenderQueue implements RenderQueue {
  private jobs: readonly QueueJob[] = [];

  async enqueue(job: QueueJob): Promise<void> {
    this.jobs = [...this.jobs, job];
  }

  async getQueueHealth(): Promise<QueueHealthReport> {
    return {
      status: "ok",
      name: DEFAULT_RENDER_QUEUE,
      counts: {
        waiting: this.jobs.length,
        active: 0,
        delayed: 0,
        failed: 0,
      },
    };
  }
}

class InMemoryUploadSigner implements UploadSigner {
  async presignUpload(request: {
    key: string;
    contentType: string;
    expiresAt: Date;
  }) {
    return {
      method: "PUT" as const,
      url: `https://storage.local/${encodeURIComponent(request.key)}`,
      headers: {
        "content-type": request.contentType,
      },
      expiresAt: request.expiresAt.toISOString(),
    };
  }
}

class InMemoryDownloadSigner implements DownloadSigner {
  async presignDownload(request: DownloadSignerRequest) {
    return {
      method: "GET" as const,
      url: `https://storage.local/${encodeURIComponent(request.key)}`,
      headers: {},
      expiresAt: request.expiresAt.toISOString(),
    };
  }
}

function extractRenderJobId(pathname: string): string | undefined {
  const match = /^\/api\/render-jobs\/([^/]+)$/.exec(pathname);

  if (!match) {
    return undefined;
  }

  return decodeURIComponent(match[1]);
}

function createRequiredS3UploadSigner(
  storage: S3UploadSignerConfig | undefined,
): UploadSigner & DownloadSigner {
  if (!storage) {
    throw new Error("storage configuration is required for upload presigning");
  }

  return createS3UploadSigner(storage);
}

function resolveQueueHealthCheck(queue: RenderQueue): QueueHealthCheck {
  if (hasQueueHealthCheck(queue)) {
    return queue;
  }

  return {
    async getQueueHealth(): Promise<QueueHealthReport> {
      return {
        status: "unavailable",
        name: DEFAULT_RENDER_QUEUE,
        counts: {
          waiting: 0,
          active: 0,
          delayed: 0,
          failed: 0,
        },
        errorCode: "queue_check_not_configured",
      };
    },
  };
}

function hasQueueHealthCheck(value: RenderQueue): value is RenderQueue & QueueHealthCheck {
  return "getQueueHealth" in value && typeof value.getQueueHealth === "function";
}
