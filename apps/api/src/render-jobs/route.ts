import { apiError, created, ok, type HttpResponse } from "../api-response";
import {
  createRenderJob,
  getRenderJobById,
  RenderJobActiveEditBriefRejectedError,
  RenderJobPlanRejectedError,
} from "./service";
import type {
  CreateRenderJobDependencies,
  CreateRenderJobResult,
  RenderJobReadModel,
} from "./types";
import { validateCreateRenderJobBody } from "./validation";

export interface RenderJobHandlerRequest {
  body: unknown;
}

export type RenderJobHandler = (
  request: RenderJobHandlerRequest,
) => Promise<HttpResponse<CreateRenderJobResult>>;

export interface GetRenderJobHandlerRequest {
  params: {
    id: string;
  };
}

export type GetRenderJobHandler = (
  request: GetRenderJobHandlerRequest,
) => Promise<HttpResponse<RenderJobReadModel>>;

export function createRenderJobHandler(dependencies: CreateRenderJobDependencies): RenderJobHandler {
  return async (request) => {
    const validation = validateCreateRenderJobBody(request.body);

    if (!validation.ok || !validation.value) {
      return apiError(
        400,
        "validation_error",
        "Request validation failed",
        validation.details ?? [],
      );
    }

    try {
      const result = await createRenderJob(validation.value, dependencies);
      return created(result, `/api/render-jobs/${result.renderJob.id}`);
    } catch (error) {
      if (error instanceof RenderJobPlanRejectedError) {
        return apiError(403, error.code, error.message);
      }

      if (error instanceof RenderJobActiveEditBriefRejectedError) {
        return apiError(
          409,
          "invalid_active_edit_brief",
          error.message,
          error.details,
        );
      }

      return apiError(500, "internal_error", "Unable to create render job.");
    }
  };
}

export function createGetRenderJobHandler(dependencies: CreateRenderJobDependencies): GetRenderJobHandler {
  return async (request) => {
    const id = request.params.id.trim();

    if (id.length === 0) {
      return apiError(400, "validation_error", "Render job id is required.");
    }

    try {
      const renderJob = await getRenderJobById(id, dependencies);

      if (!renderJob) {
        return apiError(404, "not_found", "Render job not found.");
      }

      return ok(renderJob);
    } catch (_error) {
      return apiError(500, "internal_error", "Unable to read render job.");
    }
  };
}
