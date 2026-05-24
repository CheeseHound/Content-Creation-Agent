import { apiError, created, type HttpResponse } from "../api-response";
import { createUploadPresign, UploadPresignRejectedError } from "./service";
import type {
  CreateUploadPresignDependencies,
  UploadPresignResult,
} from "./types";
import { validateCreateUploadPresignBody } from "./validation";

export interface UploadPresignHandlerRequest {
  body: unknown;
}

export type UploadPresignHandler = (
  request: UploadPresignHandlerRequest,
) => Promise<HttpResponse<UploadPresignResult>>;

export function createUploadPresignHandler(
  dependencies: CreateUploadPresignDependencies,
): UploadPresignHandler {
  return async (request) => {
    const validation = validateCreateUploadPresignBody(request.body);

    if (!validation.ok || !validation.value) {
      return apiError(
        400,
        "validation_error",
        "Request validation failed",
        validation.details ?? [],
      );
    }

    try {
      const result = await createUploadPresign(validation.value, dependencies);
      return created(result, `/api/uploads/${result.asset.id}`);
    } catch (error) {
      if (error instanceof UploadPresignRejectedError) {
        return apiError(403, error.code, error.message);
      }

      return apiError(500, "internal_error", "Unable to create upload target.");
    }
  };
}
