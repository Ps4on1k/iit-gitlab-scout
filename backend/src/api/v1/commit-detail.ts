import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";

export async function commitDetailRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { email?: string; project_ids?: string; date_from?: string; date_to?: string; limit?: string; offset?: string };
  }>("/api/v1/contributor-commits", { preHandler: [requireAuth] }, async (request, reply) => {
    const { email, project_ids, date_from, date_to, limit: rawLimit, offset: rawOffset } = request.query;
    if (!email) return reply.status(400).send({ ok: false, error: "email is required" });

    const pool = getPool();
    const limit = Math.min(Math.max(parseInt(rawLimit || "100") || 100, 1), 500);
    const offset = Math.max(parseInt(rawOffset || "0") || 0, 0);

    // Resolve all emails for this contributor from directory + profiles
    const dirResult = await pool.query("SELECT emails FROM contributor_directory WHERE emails @> ARRAY[$1]::text[]", [email]);
    let allEmails: string[] = [email];
    if (dirResult.rows.length > 0 && dirResult.rows[0].emails) {
      allEmails = dirResult.rows[0].emails;
    } else {
      const profileResult = await pool.query(
        "SELECT DISTINCT author_email FROM contributor_profiles WHERE author_email = $1",
        [email]
      );
      if (profileResult.rows.length > 0) {
        const nameResult = await pool.query(
          "SELECT DISTINCT author_email FROM contributor_profiles WHERE author_name = (SELECT author_name FROM contributor_profiles WHERE author_email = $1 LIMIT 1)",
          [email]
        );
        if (nameResult.rows.length > 0) {
          allEmails = nameResult.rows.map((r: any) => r.author_email);
        }
      }
    }

    const conditions: string[] = [`author_email = ANY($1)`];
    const params: any[] = [allEmails];
    let idx = 2;

    if (project_ids) {
      const ids = project_ids.split(",").map(Number).filter(Boolean);
      if (ids.length > 0) { conditions.push(`project_id = ANY($${idx++})`); params.push(ids); }
    }
    if (date_from) { conditions.push(`committed_date >= $${idx++}`); params.push(date_from); }
    if (date_to) { conditions.push(`committed_date <= $${idx++}`); params.push(date_to + "T23:59:59Z"); }

    const where = conditions.join(" AND ");

    const countResult = await pool.query(
      `SELECT COUNT(*)::int as total FROM commits c WHERE ${where}`,
      params
    );

    params.push(limit);
    params.push(offset);

    const result = await pool.query(
      `SELECT c.*, p.label as project_label, p.tags as project_tags
       FROM commits c
       JOIN projects p ON p.id = c.project_id
       WHERE ${where}
       ORDER BY c.committed_date DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    return { ok: true, data: { commits: result.rows, total: countResult.rows[0]?.total || 0, limit, offset } };
  });
}
