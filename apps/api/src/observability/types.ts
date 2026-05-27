export type HealthStatus = "ok" | "degraded";
export type ComponentHealthStatus = "ok" | "degraded" | "unavailable";

export interface LivenessReport {
  status: "ok";
  generatedAt: string;
}

export interface ReadinessReport {
  status: HealthStatus;
  generatedAt: string;
  checks: {
    database: DatabaseHealthReport;
    queue: QueueHealthReport;
    storage: StorageHealthReport;
  };
}

export interface DatabaseHealthReport {
  status: HealthStatus;
  connection: {
    status: ComponentHealthStatus;
    errorCode?: string;
  };
  migrations: {
    status: ComponentHealthStatus;
    applied: string[];
  };
  tables: DatabaseTableHealth[];
}

export interface DatabaseTableHealth {
  name: string;
  status: "ok" | "missing";
  approximateRowCount: number;
}

export interface QueueHealthReport {
  status: ComponentHealthStatus;
  name: string;
  counts: {
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
  };
  errorCode?: string;
}

export interface StorageHealthReport {
  status: ComponentHealthStatus;
  provider: "s3_compatible" | "local";
  configured: boolean;
  errorCode?: string;
}

export interface DatabaseHealthRepository {
  getDatabaseHealth(): Promise<DatabaseHealthReport>;
}

export interface QueueHealthCheck {
  getQueueHealth(): Promise<QueueHealthReport>;
}

export interface StorageHealthCheck {
  getStorageHealth(): Promise<StorageHealthReport>;
}

export interface ObservabilityDependencies {
  databaseHealthRepository?: DatabaseHealthRepository;
  queueHealthCheck?: QueueHealthCheck;
  storageHealthCheck?: StorageHealthCheck;
  now?: () => Date;
}
