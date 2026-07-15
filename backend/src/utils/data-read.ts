import { getPool } from "../db/pool.js";
import { getClickHouse } from "../db/clickhouse.js";
import { getEnv } from "../config.js";

export type ReadMode = "postgresql" | "clickhouse" | "hybrid";

export function getReadMode(): ReadMode {
  return getEnv().DATA_READ_MODE || "postgresql";
}

/**
 * Execute a query against the appropriate database based on DATA_READ_MODE.
 * For 'hybrid' mode: writes go to PG, reads go to CH (if available).
 */
export async function readQuery<T = any>(
  sql: string,
  params?: any[],
  options?: { forcePostgres?: boolean }
): Promise<{ rows: T[] }> {
  const mode = getReadMode();

  if (options?.forcePostgres || mode === "postgresql") {
    const pool = getPool();
    const result = await pool.query(sql, params);
    return { rows: result.rows };
  }

  if (mode === "clickhouse" || mode === "hybrid") {
    try {
      const ch = getClickHouse();
      const result = await ch.query({ query: sql, query_params: params as any });
      const text = await result.text();
      const rows = JSON.parse(text).data as T[];
      return { rows };
    } catch (err) {
      // Fallback to PostgreSQL if ClickHouse is unavailable
      console.warn(`[data-read] ClickHouse query failed, falling back to PostgreSQL:`, err);
      const pool = getPool();
      const result = await pool.query(sql, params);
      return { rows: result.rows };
    }
  }

  // Default: PostgreSQL
  const pool = getPool();
  const result = await pool.query(sql, params);
  return { rows: result.rows };
}

/**
 * Write data to PostgreSQL (always, regardless of DATA_READ_MODE).
 */
export async function writeQuery(sql: string, params?: any[]): Promise<any> {
  const pool = getPool();
  return pool.query(sql, params);
}
