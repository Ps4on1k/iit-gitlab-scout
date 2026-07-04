import { getPool } from "../db/pool.js";

export async function logAuditAction(userId: number, action: string, details?: string): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)`,
      [userId, action, details || ""]
    );
  } catch (err) {
    console.error("[audit] Failed to log action:", action, "userId:", userId, "error:", err instanceof Error ? err.message : err);
  }
}
