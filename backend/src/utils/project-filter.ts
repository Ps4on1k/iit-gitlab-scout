import { getPool } from "../db/pool.js";

const filterCache = new Map<number, { ids: number[] | null; expiresAt: number }>();
const FILTER_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

export async function getFilteredProjectIds(userId: number): Promise<number[] | null> {
  const now = Date.now();
  const cached = filterCache.get(userId);
  if (cached && now < cached.expiresAt) return cached.ids;

  const pool = getPool();
  const userResult = await pool.query("SELECT role, allowed_tags FROM app_users WHERE id = $1", [userId]);
  const row = userResult.rows[0];
  let ids: number[] | null;
  if (!row) ids = [];
  else if (row.role === "admin") ids = null;
  else if (!row.allowed_tags || row.allowed_tags.length === 0) ids = null;
  else {
    const projResult = await pool.query("SELECT id FROM projects WHERE tags && $1", [row.allowed_tags]);
    const projIds = projResult.rows.map((r: any) => r.id);
    ids = projIds.length > 0 ? projIds : [];
  }

  filterCache.set(userId, { ids, expiresAt: now + FILTER_CACHE_TTL });
  return ids;
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
