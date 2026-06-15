import pg from "pg";
import { getEnv } from "../config.js";

let _pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (_pool) return _pool;
  const env = getEnv();
  _pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  return _pool;
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
