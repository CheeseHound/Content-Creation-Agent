import type { ProductAnalyticsEventPayload, ProductAnalyticsSink } from "./types";

class NoopProductAnalyticsSink implements ProductAnalyticsSink {
  async track(_event: ProductAnalyticsEventPayload): Promise<void> {
    return;
  }
}

export function createNoopProductAnalyticsSink(): ProductAnalyticsSink {
  return new NoopProductAnalyticsSink();
}
