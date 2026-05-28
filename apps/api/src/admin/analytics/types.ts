import type { RenderJobStatus, SubscriptionTier } from "../../render-jobs/types";
import type { AdminAuthorizer } from "../auth";

export interface AdminAnalyticsSummaryRequest {
  workspaceId?: string;
  start: Date;
  end: Date;
  generatedAt: Date;
}

export interface AdminAnalyticsSummary {
  generatedAt: string;
  window: {
    start: string;
    end: string;
  };
  workspaceId?: string;
  workspaces: {
    total: number;
    byTier: Record<SubscriptionTier, number>;
  };
  uploads: {
    count: number;
    totalBytes: number;
  };
  transcripts: {
    count: number;
    segmentCount: number;
  };
  editBriefs: {
    briefCount: number;
    versionCount: number;
  };
  decisionLists: {
    count: number;
  };
  renderJobs: {
    total: number;
    byStatus: Record<RenderJobStatus, number>;
    successRate: number;
    estimatedRenderMinutes: number;
    queueLatency: AdminAnalyticsTimingSummary;
    renderDuration: AdminAnalyticsTimingSummary;
    failureCodes: Array<{
      code: string;
      count: number;
    }>;
  };
  usage: {
    renderMinutes: number;
    reconciliation: {
      readyRenderJobs: number;
      ledgeredRenderJobs: number;
      unledgeredReadyRenderJobs: number;
      estimatedReadyRenderMinutes: number;
      ledgeredReadyRenderMinutes: number;
      varianceRenderMinutes: number;
    };
  };
  storage: {
    outputCount: number;
    totalOutputBytes: number;
  };
}

export interface AdminAnalyticsTimingSummary {
  measuredJobs: number;
  averageSeconds: number;
  p95Seconds: number;
  maxSeconds: number;
}

export interface AdminAnalyticsRepository {
  getSummary(request: AdminAnalyticsSummaryRequest): Promise<AdminAnalyticsSummary>;
}

export interface AdminAnalyticsDependencies {
  adminAnalyticsRepository: AdminAnalyticsRepository;
  adminAuthorizer: AdminAuthorizer;
}
