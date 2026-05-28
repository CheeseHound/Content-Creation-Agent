import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadWorkerConfig } from "../src/config";

describe("worker config", () => {
  it("loads the Hyperframes worker runtime and explicit render mode from environment", () => {
    const config = loadWorkerConfig({
      DATABASE_URL: "postgres://user:pass@localhost:5432/content_ops",
      REDIS_URL: "redis://localhost:6379",
      CONTENT_OPS_WORKER_WORKSPACE_ROOT: "/tmp/content-ops-worker",
      CONTENT_OPS_WORKER_LOCAL_STORAGE_ROOT: "/tmp/content-ops-storage",
      CONTENT_OPS_WORKER_MODE: "real",
      CONTENT_OPS_WORKER_STORAGE_MODE: "local",
      CHROME_EXECUTABLE_PATH: "/usr/bin/chromium",
      FFMPEG_PATH: "/usr/bin/ffmpeg",
      HYPERFRAMES_COMMAND: "npx hyperframes",
      WORKER_CONCURRENCY: "2",
    });

    assert.equal(config.databaseUrl, "postgres://user:pass@localhost:5432/content_ops");
    assert.equal(config.redisUrl, "redis://localhost:6379");
    assert.equal(config.workspaceRoot, "/tmp/content-ops-worker");
    assert.equal(config.concurrency, 2);
    assert.equal(config.renderMode, "real");
    assert.deepEqual(config.storage, {
      mode: "local",
      localRoot: "/tmp/content-ops-storage",
    });
    assert.deepEqual(config.runtime, {
      chromeExecutablePath: "/usr/bin/chromium",
      ffmpegPath: "/usr/bin/ffmpeg",
      hyperframesCommand: "npx hyperframes",
    });
    assert.deepEqual(config.productAnalytics, {
      sink: "none",
    });
  });

  it("reports missing secrets by name without echoing configured values", () => {
    assert.throws(
      () => loadWorkerConfig({
        DATABASE_URL: "postgres://user:fixture-redacted-value@localhost:5432/content_ops",
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /REDIS_URL/);
        assert.doesNotMatch(error.message, /fixture-redacted-value/);
        return true;
      },
    );
  });

  it("defaults to mock mode while the real render path is explicitly opted in", () => {
    const config = loadWorkerConfig({
      DATABASE_URL: "postgres://user:pass@localhost:5432/content_ops",
      REDIS_URL: "redis://localhost:6379",
    });

    assert.equal(config.renderMode, "mock");
    assert.deepEqual(config.storage, {
      mode: "local",
      localRoot: ".content-ops-storage",
    });
  });

  it("rejects unsupported worker modes", () => {
    assert.throws(
      () => loadWorkerConfig({
        DATABASE_URL: "postgres://user:pass@localhost:5432/content_ops",
        REDIS_URL: "redis://localhost:6379",
        CONTENT_OPS_WORKER_MODE: "fixture-redacted-value",
      }),
      /CONTENT_OPS_WORKER_MODE/,
    );
  });

  it("loads S3-compatible storage settings only when the worker storage mode opts in", () => {
    const config = loadWorkerConfig({
      DATABASE_URL: "postgres://user:pass@localhost:5432/content_ops",
      REDIS_URL: "redis://localhost:6379",
      CONTENT_OPS_WORKER_STORAGE_MODE: "s3",
      CONTENT_OPS_STORAGE_BUCKET: "content-ops-dev",
      CONTENT_OPS_STORAGE_REGION: "auto",
      CONTENT_OPS_STORAGE_ENDPOINT: "https://account.r2.cloudflarestorage.com",
      CONTENT_OPS_STORAGE_ACCESS_KEY_ID: "local-access-key",
      CONTENT_OPS_STORAGE_SECRET_ACCESS_KEY: "local-secret-key",
      CONTENT_OPS_STORAGE_FORCE_PATH_STYLE: "true",
    });

    assert.deepEqual(config.storage, {
      mode: "s3",
      bucket: "content-ops-dev",
      region: "auto",
      endpoint: "https://account.r2.cloudflarestorage.com",
      accessKeyId: "local-access-key",
      secretAccessKey: "local-secret-key",
      forcePathStyle: true,
    });
  });

  it("parses PostHog product analytics settings without echoing secrets", () => {
    const config = loadWorkerConfig({
      DATABASE_URL: "postgres://user:pass@localhost:5432/content_ops",
      REDIS_URL: "redis://localhost:6379",
      PRODUCT_ANALYTICS_SINK: "posthog",
      POSTHOG_API_KEY: "fixture-redacted-value",
      POSTHOG_HOST: "https://us.posthog.com",
    });

    assert.deepEqual(config.productAnalytics, {
      sink: "posthog",
      postHog: {
        apiKey: "fixture-redacted-value",
        host: "https://us.posthog.com",
      },
    });
  });

  it("fails fast for incomplete S3 worker storage settings without echoing secrets", () => {
    assert.throws(
      () => loadWorkerConfig({
        DATABASE_URL: "postgres://user:pass@localhost:5432/content_ops",
        REDIS_URL: "redis://localhost:6379",
        CONTENT_OPS_WORKER_STORAGE_MODE: "s3",
        CONTENT_OPS_STORAGE_BUCKET: "content-ops-dev",
        CONTENT_OPS_STORAGE_SECRET_ACCESS_KEY: "fixture-redacted-value",
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /CONTENT_OPS_STORAGE_REGION/);
        assert.doesNotMatch(error.message, /fixture-redacted-value/);
        return true;
      },
    );
  });
});
