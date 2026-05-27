import type {
  DatabaseHealthReport,
  LivenessReport,
  ObservabilityDependencies,
  QueueHealthReport,
  ReadinessReport,
  StorageHealthReport,
} from "./types";

export function getLiveness(dependencies: ObservabilityDependencies = {}): LivenessReport {
  return {
    status: "ok",
    generatedAt: currentTime(dependencies).toISOString(),
  };
}

export async function getReadiness(
  dependencies: ObservabilityDependencies,
): Promise<ReadinessReport> {
  const [database, queue, storage] = await Promise.all([
    getDatabaseHealth(dependencies),
    getQueueHealth(dependencies),
    getStorageHealth(dependencies),
  ]);
  const status = (
    database.status === "ok" &&
    queue.status === "ok" &&
    storage.status === "ok"
  )
    ? "ok"
    : "degraded";

  return {
    status,
    generatedAt: currentTime(dependencies).toISOString(),
    checks: {
      database,
      queue,
      storage,
    },
  };
}

export function createConfiguredStorageHealthCheck(
  provider: StorageHealthReport["provider"] = "s3_compatible",
) {
  return {
    async getStorageHealth(): Promise<StorageHealthReport> {
      return {
        status: "ok",
        provider,
        configured: true,
      };
    },
  };
}

async function getDatabaseHealth(
  dependencies: ObservabilityDependencies,
): Promise<DatabaseHealthReport> {
  if (!dependencies.databaseHealthRepository) {
    return {
      status: "degraded",
      connection: {
        status: "unavailable",
        errorCode: "database_check_not_configured",
      },
      migrations: {
        status: "unavailable",
        applied: [],
      },
      tables: [],
    };
  }

  try {
    return await dependencies.databaseHealthRepository.getDatabaseHealth();
  } catch (_error) {
    return {
      status: "degraded",
      connection: {
        status: "unavailable",
        errorCode: "database_unavailable",
      },
      migrations: {
        status: "unavailable",
        applied: [],
      },
      tables: [],
    };
  }
}

async function getQueueHealth(
  dependencies: ObservabilityDependencies,
): Promise<QueueHealthReport> {
  if (!dependencies.queueHealthCheck) {
    return {
      status: "unavailable",
      name: "content-ops-render",
      counts: {
        waiting: 0,
        active: 0,
        delayed: 0,
        failed: 0,
      },
      errorCode: "queue_check_not_configured",
    };
  }

  try {
    return await dependencies.queueHealthCheck.getQueueHealth();
  } catch (_error) {
    return {
      status: "unavailable",
      name: "content-ops-render",
      counts: {
        waiting: 0,
        active: 0,
        delayed: 0,
        failed: 0,
      },
      errorCode: "queue_unavailable",
    };
  }
}

async function getStorageHealth(
  dependencies: ObservabilityDependencies,
): Promise<StorageHealthReport> {
  if (!dependencies.storageHealthCheck) {
    return {
      status: "unavailable",
      provider: "s3_compatible",
      configured: false,
      errorCode: "storage_check_not_configured",
    };
  }

  try {
    return await dependencies.storageHealthCheck.getStorageHealth();
  } catch (_error) {
    return {
      status: "unavailable",
      provider: "s3_compatible",
      configured: false,
      errorCode: "storage_unavailable",
    };
  }
}

function currentTime(dependencies: ObservabilityDependencies): Date {
  return dependencies.now?.() ?? new Date();
}
