import http, { type IncomingMessage, type ServerResponse } from "node:http";

import { apiError, type HttpResponse } from "./api-response";
import { loadMigrations, runMigrations } from "./db/migrations";
import {
  createPostgresClient,
  type ManagedPostgresClient,
} from "./db/postgres-client";
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
    CreateUploadPresignDependencies {}

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
  uploadTtlSeconds?: number;
  outputDownloadTtlSeconds?: number;
}

export function createApiServer(dependencies: ApiServerDependencies): http.Server {
  const renderJobHandler = createRenderJobHandler(dependencies);
  const getRenderJobHandler = createGetRenderJobHandler(dependencies);
  const uploadPresignHandler = createUploadPresignHandler(dependencies);

  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");

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
    outputSigner: new InMemoryDownloadSigner(),
    uploadRepository: repository,
    signer: new InMemoryUploadSigner(),
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

  return {
    repository: new PostgresRenderJobRepository(client),
    queue,
    outputSigner: signer,
    uploadRepository: new PostgresUploadRepository(client),
    signer,
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

class InMemoryRenderJobRepository implements RenderJobRepository {
  private readonly subscription: WorkspaceSubscription = { tier: "creator" };
  private readonly usage: UsageSnapshot = { activeRenderJobs: 0, renderedMinutesThisPeriod: 0 };
  private jobsById: ReadonlyMap<string, RenderJobRecord> = new Map();
  private mediaAssetsById: ReadonlyMap<string, MediaAssetRecord> = new Map();

  async getWorkspaceSubscription(_workspaceId: string): Promise<WorkspaceSubscription> {
    return this.subscription;
  }

  async getUsageSnapshot(_workspaceId: string): Promise<UsageSnapshot> {
    return this.usage;
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
}

class InMemoryRenderQueue implements RenderQueue {
  private jobs: readonly QueueJob[] = [];

  async enqueue(job: QueueJob): Promise<void> {
    this.jobs = [...this.jobs, job];
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
