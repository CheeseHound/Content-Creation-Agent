import { apiError, created, type HttpResponse } from "../api-response";
import { createEditBrief } from "./service";
import type {
  CreateEditBriefDependencies,
  CreateEditBriefResult,
} from "./types";
import { validateCreateEditBriefBody } from "./validation";

export interface EditBriefHandlerRequest {
  body: unknown;
}

export type EditBriefHandler = (
  request: EditBriefHandlerRequest,
) => Promise<HttpResponse<CreateEditBriefResult>>;

export function createEditBriefHandler(dependencies: CreateEditBriefDependencies): EditBriefHandler {
  return async (request) => {
    const validation = validateCreateEditBriefBody(request.body);

    if (!validation.ok || !validation.value) {
      return apiError(
        400,
        "validation_error",
        "Request validation failed",
        validation.details ?? [],
      );
    }

    try {
      const result = await createEditBrief(validation.value, dependencies);
      return created(result, `/api/edit-briefs/${result.editBrief.id}/versions/${result.editBrief.versionNumber}`);
    } catch (_error) {
      return apiError(500, "internal_error", "Unable to create edit brief.");
    }
  };
}
