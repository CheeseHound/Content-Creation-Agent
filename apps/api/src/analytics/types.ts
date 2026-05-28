export type AnalyticsPrimitive = string | number | boolean;
export type AnalyticsValue =
  | AnalyticsPrimitive
  | AnalyticsValue[]
  | { readonly [key: string]: AnalyticsValue };

export type AnalyticsProperties = Record<string, AnalyticsValue>;

export type ProductAnalyticsEventName =
  | "upload_presigned"
  | "source_uploaded"
  | "source_transcribed"
  | "edit_brief_created"
  | "decision_list_created"
  | "render_job_created"
  | "render_started"
  | "render_ready"
  | "render_failed"
  | "output_downloaded"
  | "checkout_started"
  | "subscription_updated";

export interface ProductAnalyticsEventPayload {
  eventName: ProductAnalyticsEventName;
  workspaceId: string;
  occurredAt: string;
  projectId?: string;
  userId?: string;
  sourceAssetId?: string;
  editBriefId?: string;
  decisionListId?: string;
  renderJobId?: string;
  properties: AnalyticsProperties;
}

export interface ProductAnalyticsSink {
  track(event: ProductAnalyticsEventPayload): Promise<void>;
}

export interface TrackProductAnalyticsEventInput {
  sink: ProductAnalyticsSink;
  eventName: string;
  workspaceId: string;
  occurredAt: Date;
  projectId?: string;
  userId?: string;
  sourceAssetId?: string;
  editBriefId?: string;
  decisionListId?: string;
  renderJobId?: string;
  properties?: Record<string, unknown>;
}
