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
        rows: [...result.rows] as TRow[],
      };
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}
