import { sanitizeAnalyticsProperties } from "./product-events";
import type {
  AnalyticsProperties,
  ProductAnalyticsEventPayload,
  ProductAnalyticsSink,
} from "./types";

export type ProductAnalyticsSinkConfig =
  | { sink: "none" }
  | {
    sink: "posthog";
    postHog: PostHogProductAnalyticsSinkConfig;
  };

export interface PostHogProductAnalyticsSinkConfig {
  apiKey: string;
  host: string;
  fetch?: ProductAnalyticsFetch;
}

export interface ProductAnalyticsFetch {
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

class NoopProductAnalyticsSink implements ProductAnalyticsSink {
  async track(_event: ProductAnalyticsEventPayload): Promise<void> {
    return;
  }
}

export function createNoopProductAnalyticsSink(): ProductAnalyticsSink {
  return new NoopProductAnalyticsSink();
}

export function createProductAnalyticsSink(
  config: ProductAnalyticsSinkConfig,
): ProductAnalyticsSink {
  if (config.sink === "none") {
    return createNoopProductAnalyticsSink();
  }

  return createPostHogProductAnalyticsSink(config.postHog);
}

export function createPostHogProductAnalyticsSink(
  config: PostHogProductAnalyticsSinkConfig,
): ProductAnalyticsSink {
  return new PostHogProductAnalyticsSink(config);
}

class PostHogProductAnalyticsSink implements ProductAnalyticsSink {
  private readonly captureUrl: string;
  private readonly fetch: ProductAnalyticsFetch;

  constructor(private readonly config: PostHogProductAnalyticsSinkConfig) {
    this.captureUrl = new URL("/capture/", config.host).toString();
    this.fetch = config.fetch ?? GLOBAL_PRODUCT_ANALYTICS_FETCH;
  }

  async track(event: ProductAnalyticsEventPayload): Promise<void> {
    const response = await this.fetch.fetch(this.captureUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        api_key: this.config.apiKey,
        distinct_id: event.userId ?? event.workspaceId,
        event: event.eventName,
        timestamp: event.occurredAt,
        properties: buildPostHogProperties(event),
      }),
    });

    if (!response.ok) {
      throw new Error(`PostHog capture failed with status ${response.status}.`);
    }
  }
}

function buildPostHogProperties(event: ProductAnalyticsEventPayload): AnalyticsProperties {
  return sanitizeAnalyticsProperties({
    ...event.properties,
    workspaceId: event.workspaceId,
    projectId: event.projectId,
    userId: event.userId,
    sourceAssetId: event.sourceAssetId,
    editBriefId: event.editBriefId,
    decisionListId: event.decisionListId,
    renderJobId: event.renderJobId,
  });
}

const GLOBAL_PRODUCT_ANALYTICS_FETCH: ProductAnalyticsFetch = {
  async fetch(url, init) {
    return globalThis.fetch(url, init);
  },
};
