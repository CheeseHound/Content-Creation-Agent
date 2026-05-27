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
    failureCodes: Array<{
      code: string;
      count: number;
    }>;
  };
  usage: {
    renderMinutes: number;
  };
}

export interface AdminAnalyticsRepository {
  getSummary(request: AdminAnalyticsSummaryRequest): Promise<AdminAnalyticsSummary>;
}

export interface AdminAnalyticsDependencies {
  adminAnalyticsRepository: AdminAnalyticsRepository;
  adminAuthorizer: AdminAuthorizer;
}
