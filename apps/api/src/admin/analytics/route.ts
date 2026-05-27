import { apiError, ok, type HttpResponse } from "../../api-response";
import type { AdminAuthorizer } from "../auth";
import type {
  AdminAnalyticsRepository,
  AdminAnalyticsSummary,
} from "./types";

export interface AdminAnalyticsSummaryHandlerRequest {
  headers: Record<string, string | undefined>;
  query: URLSearchParams;
}

export interface CreateAdminAnalyticsSummaryHandlerDependencies {
  adminAnalyticsRepository: AdminAnalyticsRepository;
  adminAuthorizer: AdminAuthorizer;
  now?: () => Date;
}

export type AdminAnalyticsSummaryHandler = (
  request: AdminAnalyticsSummaryHandlerRequest,
) => Promise<HttpResponse<AdminAnalyticsSummary>>;

const MAX_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function createAdminAnalyticsSummaryHandler(
  dependencies: CreateAdminAnalyticsSummaryHandlerDependencies,
): AdminAnalyticsSummaryHandler {
  return async (request) => {
    const authorization = dependencies.adminAuthorizer.authorize({
      headers: request.headers,
    });

    if (!authorization.ok) {
      return apiError(authorization.status, authorization.code, authorization.message);
    }

    const validation = validateSummaryQuery(request.query, dependencies.now?.() ?? new Date());

    if (!validation.ok) {
      return apiError(400, "validation_error", validation.message);
    }

    try {
      return ok(await dependencies.adminAnalyticsRepository.getSummary(validation.value));
    } catch (_error) {
      return apiError(500, "internal_error", "Unable to read admin analytics summary.");
    }
  };
}

function validateSummaryQuery(
  query: URLSearchParams,
  now: Date,
):
  | {
      ok: true;
      value: {
        workspaceId?: string;
        start: Date;
        end: Date;
        generatedAt: Date;
      };
    }
  | {
      ok: false;
      message: string;
    } {
  const workspaceId = parseOptionalId(query.get("workspaceId"), "workspaceId");

  if (!workspaceId.ok) {
    return workspaceId;
  }

  let end: Date;
  let start: Date;

  try {
    end = parseDate(query.get("end"), "end") ?? truncateToUtcDay(now);
    start = parseDate(query.get("start"), "start") ?? new Date(end.getTime() - DEFAULT_WINDOW_MS);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Invalid date range.",
    };
  }

  if (start.getTime() >= end.getTime()) {
    return {
      ok: false,
      message: "start must be before end.",
    };
  }

  if (end.getTime() - start.getTime() > MAX_WINDOW_MS) {
    return {
      ok: false,
      message: "Admin analytics date range must be 90 days or less.",
    };
  }

  return {
    ok: true,
    value: {
      ...(workspaceId.value ? { workspaceId: workspaceId.value } : {}),
      start,
      end,
      generatedAt: now,
    },
  };
}

function parseOptionalId(
  value: string | null,
  field: string,
):
  | { ok: true; value?: string }
  | { ok: false; message: string } {
  if (value === null || value.trim().length === 0) {
    return { ok: true };
  }

  if (!/^[A-Za-z0-9_-]{3,128}$/.test(value)) {
    return {
      ok: false,
      message: `${field} must be a safe identifier.`,
    };
  }

  return {
    ok: true,
    value,
  };
}

function parseDate(value: string | null, field: string): Date | undefined {
  if (value === null || value.trim().length === 0) {
    return undefined;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must use YYYY-MM-DD format.`);
  }

  return new Date(`${value}T00:00:00.000Z`);
}

function truncateToUtcDay(value: Date): Date {
  return new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  ));
}
