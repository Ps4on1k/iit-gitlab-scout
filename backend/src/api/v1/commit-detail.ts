import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";

export async function commitDetailRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { email?: string; project_ids?: string; date_from?: string; date_to?: string };
  }>("/api/v1/contributor-commits", { preHandler: [requireAuth] }, async (request, reply) => {
    const { email, project_ids, date_from, date_to } = request.query;
    if (!email) return reply.status(400).send({ ok: false, error: "email is required" });

    const pool = getPool();
    const conditions: string[] = [`author_email = $1`];
    const params: any[] = [email];
    let idx = 2;

    if (project_ids) {
      const ids = project_ids.split(",").map(Number).filter(Boolean);
      if (ids.length > 0) { conditions.push(`project_id = ANY($${idx++})`); params.push(ids); }
    }
    if (date_from) { conditions.push(`committed_date >= $${idx++}`); params.push(date_from); }
    if (date_to) { conditions.push(`committed_date <= $${idx++}`); params.push(date_to + "T23:59:59Z"); }

    const countResult = await pool.query(
      `SELECT COUNT(*)::int as total FROM commits c WHERE ${conditions.join(" AND ")}`,
      params
    );

    const result = await pool.query(
      `SELECT c.*, p.label as project_label, p.tag as project_tag
       FROM commits c
       JOIN projects p ON p.id = c.project_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY c.committed_date DESC
       LIMIT 99999`,
      params
    );

    return { ok: true, data: { commits: result.rows, total: countResult.rows[0]?.total || 0 } };
  });
}
