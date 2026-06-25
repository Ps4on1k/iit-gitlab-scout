import { getPool } from "../db/pool.js";

export async function logCollectionError(
  taskName: string,
  projectId: number,
  errorCode: string,
  errorMessage: string,
  source: "scheduler" | "manual" = "scheduler"
): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      "INSERT INTO scheduler_errors (task_name, project_id, error_code, error_message, source) VALUES ($1, $2, $3, $4, $5)",
      [taskName, projectId, errorCode, errorMessage, source]
    );
  } catch { /* don't let logging errors break the collection */ }
}
