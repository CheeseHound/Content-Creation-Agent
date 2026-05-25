import { Pool } from "pg";

import type {
  PostgresQueryClient,
  PostgresQueryResult,
} from "../render-jobs/postgres-repository";

export interface ManagedPostgresClient extends PostgresQueryClient {
  close(): Promise<void>;
}

export function createPostgresClient(databaseUrl: string): ManagedPostgresClient {
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  return {
    async query<TRow>(
      text: string,
      values?: readonly unknown[],
    ): Promise<PostgresQueryResult<TRow>> {
      const result = await pool.query(text, values ? [...values] : undefined);

      return {
        rows: normalizePostgresRows(result) as TRow[],
      };
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}

export function normalizePostgresRows(result: unknown): unknown[] {
  if (Array.isArray(result)) {
    return result.flatMap((entry) => normalizePostgresRows(entry));
  }

  if (hasRows(result)) {
    return [...result.rows];
  }

  return [];
}

function hasRows(value: unknown): value is { rows: readonly unknown[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "rows" in value &&
    Array.isArray((value as { rows: unknown }).rows)
  );
}
