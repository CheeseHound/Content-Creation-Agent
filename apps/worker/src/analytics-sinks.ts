import type {
  WorkerAnalyticsEventPayload,
  WorkerAnalyticsSink,
} from "./analytics";

export type WorkerAnalyticsSinkConfig =
  | { sink: "none" }
  | {
    sink: "posthog";
    postHog: PostHogWorkerAnalyticsSinkConfig;
  };

export interface PostHogWorkerAnalyticsSinkConfig {
  apiKey: string;
  host: string;
  fetch?: WorkerAnalyticsFetch;
}

export interface WorkerAnalyticsFetch {
  fetch(
    url: string,
    init: {
      method: "POST";
      headers: Record<string, string>;
      body: string;
    },
  ): Promise<{
    ok: boolean;
    status: number;
  }>;
}

class NoopWorkerAnalyticsSink implements WorkerAnalyticsSink {
  async track(_event: WorkerAnalyticsEventPayload): Promise<void> {
    return;
  }
}

export function createWorkerAnalyticsSink(
  config: WorkerAnalyticsSinkConfig,
): WorkerAnalyticsSink {
  if (config.sink === "none") {
    return new NoopWorkerAnalyticsSink();
  }

  return new PostHogWorkerAnalyticsSink(config.postHog);
}

class PostHogWorkerAnalyticsSink implements WorkerAnalyticsSink {
  private readonly captureUrl: string;
  private readonly fetch: WorkerAnalyticsFetch;

  constructor(private readonly config: PostHogWorkerAnalyticsSinkConfig) {
    this.captureUrl = new URL("/capture/", config.host).toString();
    this.fetch = config.fetch ?? GLOBAL_WORKER_ANALYTICS_FETCH;
  }

  async track(event: WorkerAnalyticsEventPayload): Promise<void> {
    const response = await this.fetch.fetch(this.captureUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        api_key: this.config.apiKey,
        distinct_id: event.userId,
        event: event.eventName,
        timestamp: event.occurredAt,
        properties: {
          ...event.properties,
          workspaceId: event.workspaceId,
          projectId: event.projectId,
          userId: event.userId,
          sourceAssetId: event.sourceAssetId,
          renderJobId: event.renderJobId,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`PostHog capture failed with status ${response.status}.`);
    }
  }
}

const GLOBAL_WORKER_ANALYTICS_FETCH: WorkerAnalyticsFetch = {
  async fetch(url, init) {
    return globalThis.fetch(url, init);
  },
};
