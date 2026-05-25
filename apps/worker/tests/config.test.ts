import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadWorkerConfig } from "../src/config";

describe("worker config", () => {
  it("loads the mock Hyperframes worker runtime boundary from environment", () => {
    const config = loadWorkerConfig({
      DATABASE_URL: "postgres://user:pass@localhost:5432/content_ops",
      REDIS_URL: "redis://localhost:6379",
      CONTENT_OPS_WORKER_WORKSPACE_ROOT: "/tmp/content-ops-worker",
      CHROME_EXECUTABLE_PATH: "/usr/bin/chromium",
      FFMPEG_PATH: "/usr/bin/ffmpeg",
      HYPERFRAMES_COMMAND: "npx hyperframes",
      WORKER_CONCURRENCY: "2",
    });

    assert.equal(config.databaseUrl, "postgres://user:pass@localhost:5432/content_ops");
    assert.equal(config.redisUrl, "redis://localhost:6379");
    assert.equal(config.workspaceRoot, "/tmp/content-ops-worker");
    assert.equal(config.concurrency, 2);
    assert.deepEqual(config.runtime, {
      chromeExecutablePath: "/usr/bin/chromium",
      ffmpegPath: "/usr/bin/ffmpeg",
      hyperframesCommand: "npx hyperframes",
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
});
