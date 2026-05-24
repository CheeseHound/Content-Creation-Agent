export interface ApiConfig {
  databaseUrl: string;
  redisUrl: string;
  port: number;
  runDbMigrations: boolean;
  billing: BillingConfig;
  transcription: TranscriptionConfig;
  storage: StorageConfig;
  uploadPresignTtlSeconds: number;
  outputDownloadTtlSeconds: number;
}

export interface BillingConfig {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
}

export interface TranscriptionConfig {
  openAiApiKey: string;
  model: string;
}

export interface StorageConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const databaseUrl = requireDatabaseUrl(env.DATABASE_URL);
  const redisUrl = requireRedisUrl(env.REDIS_URL);

  return {
    databaseUrl,
    redisUrl,
    port: parsePort(env.PORT),
    runDbMigrations: parseBooleanFlag(env.RUN_DB_MIGRATIONS, true),
    billing: {
      stripeSecretKey: requireText(env.STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY"),
      stripeWebhookSecret: requirePrefixedSecret(
        env.STRIPE_WEBHOOK_SECRET,
        "STRIPE_WEBHOOK_SECRET",
        "whsec_",
      ),
    },
    transcription: {
      openAiApiKey: requireText(env.OPENAI_API_KEY, "OPENAI_API_KEY"),
      model: requireModelId(env.OPENAI_TRANSCRIPTION_MODEL, "OPENAI_TRANSCRIPTION_MODEL"),
    },
    storage: {
      bucket: requireText(env.CONTENT_OPS_STORAGE_BUCKET, "CONTENT_OPS_STORAGE_BUCKET"),
      region: requireText(env.CONTENT_OPS_STORAGE_REGION, "CONTENT_OPS_STORAGE_REGION"),
      endpoint: parseOptionalUrl(
        env.CONTENT_OPS_STORAGE_ENDPOINT,
        "CONTENT_OPS_STORAGE_ENDPOINT",
      ),
      accessKeyId: requireText(
        env.CONTENT_OPS_STORAGE_ACCESS_KEY_ID,
        "CONTENT_OPS_STORAGE_ACCESS_KEY_ID",
      ),
      secretAccessKey: requireText(
        env.CONTENT_OPS_STORAGE_SECRET_ACCESS_KEY,
        "CONTENT_OPS_STORAGE_SECRET_ACCESS_KEY",
      ),
    },
    uploadPresignTtlSeconds: parseTtlSeconds(
      env.UPLOAD_PRESIGN_TTL_SECONDS,
      "UPLOAD_PRESIGN_TTL_SECONDS",
    ),
    outputDownloadTtlSeconds: parseTtlSeconds(
      env.OUTPUT_DOWNLOAD_TTL_SECONDS,
      "OUTPUT_DOWNLOAD_TTL_SECONDS",
    ),
  };
}

function requireDatabaseUrl(value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error("DATABASE_URL must be configured.");
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      throw new Error("unsupported protocol");
    }
  } catch (_error) {
    throw new Error("DATABASE_URL must be a valid Postgres connection string.");
  }

  return value;
}

function requireRedisUrl(value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error("REDIS_URL must be configured.");
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
      throw new Error("unsupported protocol");
    }
  } catch (_error) {
    throw new Error("REDIS_URL must be a valid Redis connection string.");
  }

  return value;
}

function parsePort(value: string | undefined): number {
  if (!value) {
    return 4000;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer from 1 to 65535.");
  }

  return port;
}

function parseBooleanFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error("RUN_DB_MIGRATIONS must be either true or false.");
}

function requireText(value: string | undefined, name: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} must be configured.`);
  }

  return value;
}

function requirePrefixedSecret(
  value: string | undefined,
  name: string,
  prefix: string,
): string {
  const secret = requireText(value, name);

  if (!secret.startsWith(prefix)) {
    throw new Error(`${name} must start with ${prefix}.`);
  }

  return secret;
}

function requireModelId(value: string | undefined, name: string): string {
  const modelId = requireText(value, name);

  if (!/^[A-Za-z0-9._:-]+$/.test(modelId)) {
    throw new Error(`${name} must be a valid model id.`);
  }

  return modelId;
}

function parseOptionalUrl(value: string | undefined, name: string): string | undefined {
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
    throw new Error(`${name} must be a valid HTTP URL.`);
  }
}

function parseTtlSeconds(value: string | undefined, name: string): number {
  if (!value) {
    return 15 * 60;
  }

  const ttlSeconds = Number(value);

  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 3600) {
    throw new Error(`${name} must be an integer from 60 to 3600.`);
  }

  return ttlSeconds;
}
