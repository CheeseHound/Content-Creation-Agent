import pg from "pg";

import {
  createBullMqRenderWorker,
  RENDER_JOB_QUEUE_NAME,
} from "./bullmq-render-worker";
import { loadWorkerConfig } from "./config";
import { processMockHyperframesRenderJob } from "./mock-hyperframes-worker";
import { PostgresRenderWorkerRepository } from "./postgres-render-worker-repository";

const { Pool } = pg;

export async function startWorker(): Promise<{ close(): Promise<void> }> {
  const config = loadWorkerConfig();
  const pool = new Pool({
    connectionString: config.databaseUrl,
  });
  const repository = new PostgresRenderWorkerRepository(pool);
  const worker = createBullMqRenderWorker({
    redisUrl: config.redisUrl,
    queueName: RENDER_JOB_QUEUE_NAME,
    concurrency: config.concurrency,
    processor: (payload) => processMockHyperframesRenderJob(payload, {
      repository,
      runtime: config.runtime,
      workspaceRoot: config.workspaceRoot,
    }),
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

if (require.main === module) {
  void startWorker().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "render worker startup failed";
    console.error(message);
    process.exitCode = 1;
  });
}
