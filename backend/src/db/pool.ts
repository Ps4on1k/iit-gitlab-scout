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

  _pool.on("error", (err) => {
    console.error("[pool] unexpected error on idle client:", err.message);
  });

  _pool.on("remove", () => {
    const total = _pool?.totalCount || 0;
    const idle = _pool?.idleCount || 0;
    if (total >= 8) {
      console.warn(`[pool] high connection usage: ${total}/10 total, ${idle} idle`);
    }
  });

  return _pool;
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
