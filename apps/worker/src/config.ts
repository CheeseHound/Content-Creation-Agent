import type { HyperframesWorkerRuntime } from "./render-worker-types";
import type { WorkerAnalyticsSinkConfig } from "./analytics-sinks";

export type WorkerRenderMode = "mock" | "real";
export type WorkerStorageMode = "local" | "s3";

export interface WorkerConfig {
  databaseUrl: string;
  redisUrl: string;
  workspaceRoot: string;
  concurrency: number;
  renderMode: WorkerRenderMode;
  storage: WorkerStorageConfig;
  runtime: HyperframesWorkerRuntime;
  productAnalytics: WorkerAnalyticsSinkConfig;
}

export type WorkerStorageConfig =
  | {
    mode: "local";
    localRoot: string;
  }
  | {
    mode: "s3";
    bucket: string;
    region: string;
    endpoint?: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle?: boolean;
  };

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return {
    databaseUrl: requiredEnv(env, "DATABASE_URL"),
    redisUrl: requiredEnv(env, "REDIS_URL"),
    workspaceRoot: env.CONTENT_OPS_WORKER_WORKSPACE_ROOT ?? ".content-ops-worker",
    concurrency: parsePositiveInteger(env.WORKER_CONCURRENCY ?? "1", "WORKER_CONCURRENCY"),
    renderMode: parseRenderMode(env.CONTENT_OPS_WORKER_MODE ?? "mock"),
    storage: parseStorageConfig(env),
    productAnalytics: parseProductAnalyticsConfig(env),
    runtime: {
      chromeExecutablePath:
        env.CHROME_EXECUTABLE_PATH ?? env.PUPPETEER_EXECUTABLE_PATH ?? "/usr/bin/chromium",
      ffmpegPath: env.FFMPEG_PATH ?? "/usr/bin/ffmpeg",
      hyperframesCommand: env.HYPERFRAMES_COMMAND ?? "npx hyperframes",
    },
  };
}

function parseProductAnalyticsConfig(env: NodeJS.ProcessEnv): WorkerAnalyticsSinkConfig {
  const sink = env.PRODUCT_ANALYTICS_SINK ?? "none";

  if (sink === "none") {
    return { sink: "none" };
  }

  if (sink !== "posthog") {
    throw new Error("PRODUCT_ANALYTICS_SINK must be either none or posthog");
  }

  return {
    sink: "posthog",
    postHog: {
      apiKey: requiredEnv(env, "POSTHOG_API_KEY"),
      host: parseOptionalHttpUrl(env.POSTHOG_HOST, "POSTHOG_HOST") ?? "https://app.posthog.com",
    },
  };
}

function parseStorageConfig(env: NodeJS.ProcessEnv): WorkerStorageConfig {
  const mode = parseStorageMode(env.CONTENT_OPS_WORKER_STORAGE_MODE ?? "local");

  if (mode === "local") {
    return {
      mode,
      localRoot: env.CONTENT_OPS_WORKER_LOCAL_STORAGE_ROOT ?? ".content-ops-storage",
    };
  }

  return {
    mode,
    bucket: requiredEnv(env, "CONTENT_OPS_STORAGE_BUCKET"),
    region: requiredEnv(env, "CONTENT_OPS_STORAGE_REGION"),
    endpoint: parseOptionalHttpUrl(
      env.CONTENT_OPS_STORAGE_ENDPOINT,
      "CONTENT_OPS_STORAGE_ENDPOINT",
    ),
    accessKeyId: requiredEnv(env, "CONTENT_OPS_STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv(env, "CONTENT_OPS_STORAGE_SECRET_ACCESS_KEY"),
    forcePathStyle: parseOptionalBooleanFlag(
      env.CONTENT_OPS_STORAGE_FORCE_PATH_STYLE,
      "CONTENT_OPS_STORAGE_FORCE_PATH_STYLE",
    ),
  };
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];

  if (!value) {
    throw new Error(`${name} is required for the render worker`);
  }

  return value;
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function parseRenderMode(value: string): WorkerRenderMode {
  if (value === "mock" || value === "real") {
    return value;
  }

  throw new Error("CONTENT_OPS_WORKER_MODE must be either mock or real");
}

function parseStorageMode(value: string): WorkerStorageMode {
  if (value === "local" || value === "s3") {
    return value;
  }

  throw new Error("CONTENT_OPS_WORKER_STORAGE_MODE must be either local or s3");
}

function parseOptionalHttpUrl(value: string | undefined, name: string): string | undefined {
  if (!value || value.trim().length === 0) {
    return undefined;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("unsupported protocol");
    }

    return value;
  } catch (_error) {
    throw new Error(`${name} must be a valid HTTP URL`);
  }
}

function parseOptionalBooleanFlag(value: string | undefined, name: string): boolean | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`${name} must be either true or false`);
}
