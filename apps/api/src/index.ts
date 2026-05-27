import { loadApiConfig } from "./config";
import { createProductAnalyticsSink } from "./analytics/sinks";
import { createApiServer, createPostgresDependencies } from "./server";

async function main(): Promise<void> {
  const config = loadApiConfig();
  const dependencies = await createPostgresDependencies({
    databaseUrl: config.databaseUrl,
    redisUrl: config.redisUrl,
    storage: config.storage,
    runMigrations: config.runDbMigrations,
    uploadTtlSeconds: config.uploadPresignTtlSeconds,
    outputDownloadTtlSeconds: config.outputDownloadTtlSeconds,
    analyticsSink: createProductAnalyticsSink(config.productAnalytics),
    adminToken: config.admin.token,
  });
  const server = createApiServer(dependencies);

  const shutdown = createShutdownHandler(server, dependencies);
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  server.listen(config.port, () => {
    process.stdout.write(`Content Ops API listening on http://localhost:${config.port}\n`);
  });
}

function createShutdownHandler(
  server: ReturnType<typeof createApiServer>,
  dependencies: Awaited<ReturnType<typeof createPostgresDependencies>>,
): () => void {
  return () => {
    server.close(() => {
      dependencies.close()
        .then(() => {
          process.exitCode = 0;
        })
        .catch(() => {
          process.exitCode = 1;
        });
    });
  };
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown startup error";

  process.stderr.write(`Content Ops API failed to start: ${message}\n`);
  process.exitCode = 1;
});
