import { Worker, type Job } from "bullmq";

import type { MockHyperframesRenderResult } from "./mock-hyperframes-worker";
import type { QueueJobPayload } from "./payload";

export const RENDER_JOB_QUEUE_NAME = "content-ops-render";
export const RENDER_JOB_QUEUE_TASK = "render-job";

export type RenderJobProcessor = (
  payload: QueueJobPayload,
) => Promise<MockHyperframesRenderResult>;

export interface BullMqRenderJob {
  name: string;
  data: QueueJobPayload;
}

export interface CreateBullMqRenderWorkerOptions {
  redisUrl: string;
  queueName?: string;
  concurrency?: number;
  processor: RenderJobProcessor;
}

export function createBullMqRenderWorkerProcessor(processor: RenderJobProcessor) {
  return async (job: BullMqRenderJob): Promise<MockHyperframesRenderResult> => {
    if (job.name !== RENDER_JOB_QUEUE_TASK) {
      throw new Error(`unexpected render worker task: ${job.name}`);
    }

    return processor(job.data);
  };
}

export function createBullMqRenderWorker({
  redisUrl,
  queueName = RENDER_JOB_QUEUE_NAME,
  concurrency = 1,
  processor,
}: CreateBullMqRenderWorkerOptions): Worker<QueueJobPayload, MockHyperframesRenderResult> {
  const bullMqProcessor = createBullMqRenderWorkerProcessor(processor);

  return new Worker<QueueJobPayload, MockHyperframesRenderResult>(
    queueName,
    async (job: Job<QueueJobPayload>) => bullMqProcessor({
      name: job.name,
      data: job.data,
    }),
    {
      concurrency,
      connection: {
        maxRetriesPerRequest: null,
        url: redisUrl,
      },
    },
  );
}
