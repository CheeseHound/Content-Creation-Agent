import { apiError, created, type HttpResponse } from "../api-response";
import {
  createEditDecisionList,
  EditDecisionListInputError,
  EditDecisionListMissingBriefError,
} from "./service";
import type {
  CreateEditDecisionListDependencies,
  CreateEditDecisionListResult,
} from "./types";
import { validateCreateEditDecisionListBody } from "./validation";

export interface EditDecisionListHandlerRequest {
  body: unknown;
}

export type EditDecisionListHandler = (
  request: EditDecisionListHandlerRequest,
) => Promise<HttpResponse<CreateEditDecisionListResult>>;

export function createEditDecisionListHandler(
  dependencies: CreateEditDecisionListDependencies,
): EditDecisionListHandler {
  return async (request) => {
    const validation = validateCreateEditDecisionListBody(request.body);

    if (!validation.ok || !validation.value) {
      return apiError(
        400,
        "validation_error",
        "Request validation failed",
        validation.details ?? [],
      );
    }

    try {
      const result = await createEditDecisionList(validation.value, dependencies);
      return created(result, `/api/edit-decision-lists/${result.decisionList.id}`);
    } catch (error) {
      if (error instanceof EditDecisionListMissingBriefError) {
        return apiError(409, "active_edit_brief_required", error.message);
      }

      if (error instanceof EditDecisionListInputError) {
        return apiError(400, "validation_error", error.message);
      }

      return apiError(500, "internal_error", "Unable to create edit decision list.");
    }
  };
}
