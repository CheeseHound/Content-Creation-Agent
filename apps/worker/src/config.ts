import type { HyperframesWorkerRuntime } from "./mock-hyperframes-worker";

export interface WorkerConfig {
  databaseUrl: string;
  redisUrl: string;
  workspaceRoot: string;
  concurrency: number;
  runtime: HyperframesWorkerRuntime;
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return {
    databaseUrl: requiredEnv(env, "DATABASE_URL"),
    redisUrl: requiredEnv(env, "REDIS_URL"),
    workspaceRoot: env.CONTENT_OPS_WORKER_WORKSPACE_ROOT ?? ".content-ops-worker",
    concurrency: parsePositiveInteger(env.WORKER_CONCURRENCY ?? "1", "WORKER_CONCURRENCY"),
    runtime: {
      chromeExecutablePath: env.CHROME_EXECUTABLE_PATH ?? env.PUPPETEER_EXECUTABLE_PATH ?? "/usr/bin/chromium",
      ffmpegPath: env.FFMPEG_PATH ?? "/usr/bin/ffmpeg",
      hyperframesCommand: env.HYPERFRAMES_COMMAND ?? "npx hyperframes",
    },
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
