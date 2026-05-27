import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadApiConfig } from "../src/config";

describe("loadApiConfig", () => {
  it("parses the runtime database configuration from environment variables", () => {
    const config = loadApiConfig({
      ...VALID_ENV,
      PORT: "4100",
      RUN_DB_MIGRATIONS: "false",
      CONTENT_OPS_STORAGE_ENDPOINT: "https://account.r2.cloudflarestorage.com",
      UPLOAD_PRESIGN_TTL_SECONDS: "600",
      OUTPUT_DOWNLOAD_TTL_SECONDS: "300",
    });

    assert.deepEqual(config, {
      databaseUrl: "postgres://content_ops:localpass@localhost:5432/content_ops",
      redisUrl: "redis://localhost:6379/0",
      port: 4100,
      runDbMigrations: false,
      billing: {
        stripeSecretKey: "sk_test_local",
        stripeWebhookSecret: "whsec_local",
      },
      transcription: {
        openAiApiKey: "sk-openai-local",
        model: "gpt-4o-mini-transcribe",
      },
      admin: {
        token: "local-admin-token-123",
      },
      storage: {
        bucket: "content-ops-dev",
        region: "auto",
        endpoint: "https://account.r2.cloudflarestorage.com",
        accessKeyId: "local-access-key",
        secretAccessKey: "local-secret-key",
      },
      uploadPresignTtlSeconds: 600,
      outputDownloadTtlSeconds: 300,
    });
  });

  it("defaults to port 4000 and runs migrations unless disabled", () => {
    const config = loadApiConfig(VALID_ENV);

    assert.equal(config.port, 4000);
    assert.equal(config.runDbMigrations, true);
    assert.equal(config.uploadPresignTtlSeconds, 900);
    assert.equal(config.outputDownloadTtlSeconds, 900);
  });

  it("fails fast when DATABASE_URL is missing", () => {
    assert.throws(
      () => loadApiConfig({
        ...VALID_ENV,
        DATABASE_URL: undefined,
        REDIS_URL: "redis://localhost:6379/0",
      }),
      /DATABASE_URL must be configured/,
    );
  });

  it("fails fast when REDIS_URL is missing", () => {
    assert.throws(
      () => loadApiConfig({
        ...VALID_ENV,
        DATABASE_URL: "postgres://content_ops:localpass@localhost:5432/content_ops",
        REDIS_URL: undefined,
      }),
      /REDIS_URL must be configured/,
    );
  });

  it("fails fast when storage settings are missing", () => {
    assert.throws(
      () => loadApiConfig({
        ...VALID_ENV,
        CONTENT_OPS_STORAGE_BUCKET: undefined,
      }),
      /CONTENT_OPS_STORAGE_BUCKET must be configured/,
    );
  });

  it("fails fast when billing or transcription settings are missing", () => {
    assert.throws(
      () => loadApiConfig({
        ...VALID_ENV,
        STRIPE_SECRET_KEY: undefined,
      }),
      /STRIPE_SECRET_KEY must be configured/,
    );

    assert.throws(
      () => loadApiConfig({
        ...VALID_ENV,
        OPENAI_TRANSCRIPTION_MODEL: undefined,
      }),
      /OPENAI_TRANSCRIPTION_MODEL must be configured/,
    );
  });

  it("fails fast when admin token settings are missing or too weak", () => {
    assert.throws(
      () => loadApiConfig({
        ...VALID_ENV,
        CONTENT_OPS_ADMIN_TOKEN: undefined,
      }),
      /CONTENT_OPS_ADMIN_TOKEN must be configured/,
    );

    assert.throws(
      () => loadApiConfig({
        ...VALID_ENV,
        CONTENT_OPS_ADMIN_TOKEN: "short",
      }),
      /CONTENT_OPS_ADMIN_TOKEN must be at least 16 characters/,
    );
  });

  it("rejects invalid DATABASE_URL and PORT values without echoing secrets", () => {
    assert.throws(
      () => loadApiConfig({
        ...VALID_ENV,
        DATABASE_URL: "postgres://content_ops:super-secret-password@localhost:5432/content_ops",
        REDIS_URL: "redis://localhost:6379/0",
        PORT: "invalid",
      }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /PORT must be an integer/);
        assert.doesNotMatch(error.message, /super-secret-password/);
        return true;
      },
    );
  });

  it("rejects invalid REDIS_URL values without echoing secrets", () => {
    assert.throws(
      () => loadApiConfig({
        ...VALID_ENV,
        DATABASE_URL: "postgres://content_ops:localpass@localhost:5432/content_ops",
        REDIS_URL: "https://:super-secret-password@localhost:6379/0",
      }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /REDIS_URL must be a valid Redis connection string/);
        assert.doesNotMatch(error.message, /super-secret-password/);
        return true;
      },
    );
  });

  it("rejects malformed external secret settings without echoing secret values", () => {
    assert.throws(
      () => loadApiConfig({
        ...VALID_ENV,
        STRIPE_SECRET_KEY: "super-secret-stripe-key",
        STRIPE_WEBHOOK_SECRET: "not-a-webhook-secret",
      }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /STRIPE_WEBHOOK_SECRET must start with whsec_/);
        assert.doesNotMatch(error.message, /super-secret-stripe-key/);
        assert.doesNotMatch(error.message, /not-a-webhook-secret/);
        return true;
      },
    );

    assert.throws(
      () => loadApiConfig({
        ...VALID_ENV,
        OPENAI_API_KEY: "super-secret-openai-key",
        OPENAI_TRANSCRIPTION_MODEL: "gpt 4o mini transcribe",
      }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /OPENAI_TRANSCRIPTION_MODEL must be a valid model id/);
        assert.doesNotMatch(error.message, /super-secret-openai-key/);
        assert.doesNotMatch(error.message, /gpt 4o mini transcribe/);
        return true;
      },
    );
  });

  it("rejects invalid storage endpoint and upload TTL values without echoing secrets", () => {
    assert.throws(
      () => loadApiConfig({
        ...VALID_ENV,
        CONTENT_OPS_STORAGE_SECRET_ACCESS_KEY: "super-secret-storage-key",
        CONTENT_OPS_STORAGE_ENDPOINT: "ftp://storage.example",
      }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /CONTENT_OPS_STORAGE_ENDPOINT must be a valid HTTP URL/);
        assert.doesNotMatch(error.message, /super-secret-storage-key/);
        return true;
      },
    );

    assert.throws(
      () => loadApiConfig({
        ...VALID_ENV,
        UPLOAD_PRESIGN_TTL_SECONDS: "10",
      }),
      /UPLOAD_PRESIGN_TTL_SECONDS must be an integer from 60 to 3600/,
    );

    assert.throws(
      () => loadApiConfig({
        ...VALID_ENV,
        OUTPUT_DOWNLOAD_TTL_SECONDS: "7200",
      }),
      /OUTPUT_DOWNLOAD_TTL_SECONDS must be an integer from 60 to 3600/,
    );
  });
});

const VALID_ENV: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgres://content_ops:localpass@localhost:5432/content_ops",
  REDIS_URL: "redis://localhost:6379/0",
  CONTENT_OPS_STORAGE_BUCKET: "content-ops-dev",
  CONTENT_OPS_STORAGE_REGION: "auto",
  CONTENT_OPS_STORAGE_ACCESS_KEY_ID: "local-access-key",
  CONTENT_OPS_STORAGE_SECRET_ACCESS_KEY: "local-secret-key",
  STRIPE_SECRET_KEY: "sk_test_local",
  STRIPE_WEBHOOK_SECRET: "whsec_local",
  OPENAI_API_KEY: "sk-openai-local",
  OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
  CONTENT_OPS_ADMIN_TOKEN: "local-admin-token-123",
};
