import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";

export async function auditLogRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { limit?: string; offset?: string; action?: string };
  }>("/api/v1/audit-log", { preHandler: [requireAdmin] }, async (request) => {
    const { limit, offset, action } = request.query;
    const pool = getPool();
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (action) {
      conditions.push(`al.action ILIKE $${idx++}`);
      params.push(`%${action}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const lim = Math.min(Number(limit) || 50, 200);
    const off = Number(offset) || 0;

    const countResult = await pool.query(
      `SELECT COUNT(*)::int as total FROM audit_log al ${where}`,
      params
    );

    const result = await pool.query(
      `SELECT al.id, al.user_id, al.action, al.details, al.created_at,
              u.username
       FROM audit_log al
       LEFT JOIN app_users u ON u.id = al.user_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, lim, off]
    );

    return {
      ok: true,
      data: {
        entries: result.rows,
        total: countResult.rows[0]?.total || 0,
      },
    };
  });
}
