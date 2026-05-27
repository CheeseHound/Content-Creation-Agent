import { createHash } from "node:crypto";

import { Queue, type JobsOptions } from "bullmq";

import type { QueueHealthCheck, QueueHealthReport } from "../observability/types";
import type { QueueJob, QueueJobPayload, RenderQueue } from "../render-jobs/types";

export const RENDER_JOB_QUEUE_TASK = "render-job";

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    delay: 5_000,
    type: "exponential",
  },
  removeOnComplete: {
    age: 86_400,
    count: 1_000,
  },
  removeOnFail: {
    age: 604_800,
    count: 5_000,
  },
} as const satisfies JobsOptions;

export interface BullMqQueueClient {
  readonly name: string;
  add(name: string, data: QueueJobPayload, options: JobsOptions): Promise<unknown>;
  getJobCounts(...types: string[]): Promise<Record<string, number>>;
  close(): Promise<void>;
}

export interface CreateBullMqRenderQueueOptions {
  redisUrl: string;
  queueName: string;
}

export class BullMqRenderQueue implements RenderQueue, QueueHealthCheck {
  constructor(private readonly queue: BullMqQueueClient) {}

  async enqueue(job: QueueJob): Promise<void> {
    if (job.queueName !== this.queue.name) {
      throw new Error(`queue name mismatch: expected ${this.queue.name}, received ${job.queueName}`);
    }

    await this.queue.add(RENDER_JOB_QUEUE_TASK, job.payload, {
      ...DEFAULT_JOB_OPTIONS,
      jobId: buildBullMqJobId(job.idempotencyKey),
      priority: job.priority,
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }

  async getQueueHealth(): Promise<QueueHealthReport> {
    const counts = await this.queue.getJobCounts("waiting", "active", "delayed", "failed");

    return {
      status: "ok",
      name: this.queue.name,
      counts: {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
      },
    };
  }
}

export function createBullMqRenderQueue({
  redisUrl,
  queueName,
}: CreateBullMqRenderQueueOptions): BullMqRenderQueue {
  const queue = new Queue<QueueJobPayload>(queueName, {
    connection: {
      maxRetriesPerRequest: 1,
      url: redisUrl,
    },
  });

  return new BullMqRenderQueue(queue);
}

function buildBullMqJobId(idempotencyKey: string): string {
  return `render_${createHash("sha256").update(idempotencyKey).digest("hex")}`;
}
