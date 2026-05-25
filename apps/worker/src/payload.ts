import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import Ajv, { type ValidateFunction } from "ajv";

export type SubscriptionTier = "free" | "creator" | "studio";
export type RenderTemplateParameterValue = string | number | boolean;
export type CaptionPosition = "top" | "center" | "bottom";
export type OverlayPosition = "top" | "center" | "bottom" | "left" | "right";

export interface MediaStorageKeys {
  source_key: string;
  audio_key: string;
  transcript_key: string;
  render_output_prefix: string;
}

export interface QueueJobPayload {
  schema_version: "content_ops.render_job.v1";
  workspace_id: string;
  project_id: string;
  user_id: string;
  source_asset_id: string;
  subscription_tier: SubscriptionTier;
  storage: MediaStorageKeys;
  render: {
    render_engine: "hyperframes";
    brand_name: string;
    audience: string;
    clip_count: number;
    platforms: string[];
    estimated_minutes: number;
    template: {
      variant: string;
      parameters: Record<string, RenderTemplateParameterValue>;
    };
    style_options: {
      font_family: string;
      brand_color: string;
      accent_color?: string;
      caption_position: CaptionPosition;
      overlay_position: OverlayPosition;
    };
    caption_timeline: Array<{
      start_ms: number;
      end_ms: number;
      text: string;
      speaker?: string;
    }>;
    source_assets: Array<{
      role: "primary_video";
      asset_id: string;
      storage_key: string;
    }>;
    composition: {
      aspect_ratio: "9:16";
      width: 1080;
      height: 1920;
      fps: 30;
    };
    output_settings: {
      format: "mp4";
      video_codec: "h264";
      audio_codec: "aac";
    };
  };
}

export interface RenderOutputManifest {
  outputs: Array<{
    id: string;
    storageKey: string;
    filename: string;
    contentType: string;
    durationSeconds?: number;
    sizeBytes?: number;
  }>;
}

export class WorkerValidationError extends Error {
  constructor(
    message: string,
    readonly publicMessage: string,
  ) {
    super(message);
    this.name = "WorkerValidationError";
  }
}

let cachedValidator: ValidateFunction | undefined;

export function validateQueuePayload(
  payload: unknown,
  schemaPath = resolve(process.cwd(), "schemas", "content-ops-render-job-v1.schema.json"),
): QueueJobPayload {
  const validate = getPayloadValidator(schemaPath);

  if (!validate(payload)) {
    throw new WorkerValidationError(
      `render payload failed schema validation: ${JSON.stringify(validate.errors ?? [])}`,
      "render payload validation failed",
    );
  }

  assertNoSecretLikeFields(payload, "payload");
  return payload as QueueJobPayload;
}

export function assertNoSecretLikeFields(value: unknown, path = "value"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSecretLikeFields(entry, `${path}[${index}]`));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  Object.entries(value).forEach(([key, entryValue]) => {
    const nextPath = `${path}.${key}`;

    if (isSecretLikeKey(key)) {
      throw new WorkerValidationError(
        `secret-like field is not allowed in render worker payload at ${nextPath}`,
        "render workspace validation failed",
      );
    }

    assertNoSecretLikeFields(entryValue, nextPath);
  });
}

function getPayloadValidator(schemaPath: string): ValidateFunction {
  if (cachedValidator) {
    return cachedValidator;
  }

  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;
  const ajv = new Ajv({ allErrors: true });
  cachedValidator = ajv.compile(schema);
  return cachedValidator;
}

function isSecretLikeKey(key: string): boolean {
  return /(^|[_-])(api[_-]?key|access[_-]?key|secret|token|password|credential)s?$/i.test(key);
}
