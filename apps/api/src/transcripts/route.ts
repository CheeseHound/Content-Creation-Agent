import { apiError, created, type HttpResponse } from "../api-response";
import { persistTranscript } from "./service";
import type {
  PersistTranscriptDependencies,
  PersistTranscriptResult,
} from "./types";
import { validatePersistTranscriptBody } from "./validation";

export interface PersistTranscriptHandlerRequest {
  body: unknown;
}

export type PersistTranscriptHandler = (
  request: PersistTranscriptHandlerRequest,
) => Promise<HttpResponse<PersistTranscriptResult>>;

export function createPersistTranscriptHandler(
  dependencies: PersistTranscriptDependencies,
): PersistTranscriptHandler {
  return async (request) => {
    const validation = validatePersistTranscriptBody(request.body);

    if (!validation.ok || !validation.value) {
      return apiError(
        400,
        "validation_error",
        "Request validation failed",
        validation.details ?? [],
      );
    }

    try {
      const result = await persistTranscript(validation.value, dependencies);
      return created(result, `/api/transcripts/${result.transcript.id}`);
    } catch (_error) {
      return apiError(500, "internal_error", "Unable to persist transcript.");
    }
  };
}
