import { getPool } from "../db/pool.js";

export async function getFilteredProjectIds(userId: number): Promise<number[] | null> {
  const pool = getPool();
  const userResult = await pool.query("SELECT role, allowed_tags FROM app_users WHERE id = $1", [userId]);
  const row = userResult.rows[0];
  if (!row) return [];
  if (row.role === "admin") return null;
  if (!row.allowed_tags || row.allowed_tags.length === 0) return null;
  const projResult = await pool.query("SELECT id FROM projects WHERE tags && $1", [row.allowed_tags]);
  const ids = projResult.rows.map((r: any) => r.id);
  return ids.length > 0 ? ids : [];
}

export function applyProjectFilter(conditions: string[], params: any[], idx: number, projectIds: number[] | null): number {
  if (projectIds === null) return idx;
  if (projectIds.length === 0) {
    conditions.push(`pb.project_id = $${idx++}`);
    params.push(-1);
    return idx;
  }
  conditions.push(`pb.project_id = ANY($${idx++})`);
  params.push(projectIds);
  return idx;
}
