import pg from "pg";

import {
  createBullMqRenderWorker,
  RENDER_JOB_QUEUE_NAME,
} from "./bullmq-render-worker";
import { loadWorkerConfig } from "./config";
import {
  CommandHyperframesRenderRunner,
  processHyperframesRenderJob,
} from "./hyperframes-worker";
import { processMockHyperframesRenderJob } from "./mock-hyperframes-worker";
import { PostgresRenderWorkerRepository } from "./postgres-render-worker-repository";
import {
  LocalFilesystemRenderStorage,
  S3CompatibleRenderStorage,
  type RenderStorageClient,
} from "./render-storage";

const { Pool } = pg;

export async function startWorker(): Promise<{ close(): Promise<void> }> {
  const config = loadWorkerConfig();
  const pool = new Pool({
    connectionString: config.databaseUrl,
  });
  const repository = new PostgresRenderWorkerRepository(pool);
  const storage = createRenderStorage(config.storage);
  const runner = new CommandHyperframesRenderRunner();
  const worker = createBullMqRenderWorker({
    redisUrl: config.redisUrl,
    queueName: RENDER_JOB_QUEUE_NAME,
    concurrency: config.concurrency,
    processor: (payload) => {
      if (config.renderMode === "mock") {
        return processMockHyperframesRenderJob(payload, {
          repository,
          runtime: config.runtime,
          workspaceRoot: config.workspaceRoot,
        });
      }

      return processHyperframesRenderJob(payload, {
        repository,
        runtime: config.runtime,
        workspaceRoot: config.workspaceRoot,
        storage,
        runner,
      });
    },
  });

  return {
    async close(): Promise<void> {
      await Promise.all([
        worker.close(),
        pool.end(),
      ]);
    },
  };
}

function createRenderStorage(
  config: ReturnType<typeof loadWorkerConfig>["storage"],
): RenderStorageClient {
  if (config.mode === "local") {
    return new LocalFilesystemRenderStorage(config.localRoot);
  }

  return new S3CompatibleRenderStorage(config);
}

if (require.main === module) {
  void startWorker().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "render worker startup failed";
    console.error(message);
    process.exitCode = 1;
  });
}
