import type { FastifyInstance } from "fastify";
import { requireAuth, requireAdmin } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import { collectIssues } from "../../services/issue-collector.js";

export async function issueRoutes(app: FastifyInstance) {
  app.post<{
    Body: { project_id: number };
  }>("/api/v1/issues/collect", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { project_id } = request.body;
    if (!project_id) {
      return reply.status(400).send({ ok: false, error: "project_id is required" });
    }
    try {
      const result = await collectIssues(project_id);
      return { ok: true, data: result };
    } catch (err) {
      return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get<{
    Querystring: { project_id?: string; project_ids?: string; tag?: string; state?: string };
  }>("/api/v1/issues", { preHandler: [requireAuth] }, async (request) => {
    const { project_id, project_ids, tag, state } = request.query;
    const pool = getPool();
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (project_ids) {
      const ids = project_ids.split(",").map(Number).filter(Boolean);
      if (ids.length > 0) { conditions.push(`pi.project_id = ANY($${idx++})`); params.push(ids); }
    } else if (project_id) {
      conditions.push(`pi.project_id = $${idx++}`);
      params.push(Number(project_id));
    }
    if (tag) {
      conditions.push(`p.tag = $${idx++}`);
      params.push(tag);
    }
    if (state) {
      conditions.push(`pi.state = $${idx++}`);
      params.push(state);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `SELECT pi.*, p.path as project_path, p.label as project_label, p.tag as project_tag
       FROM project_issues pi
       JOIN projects p ON p.id = pi.project_id
       ${where}
       ORDER BY pi.created_at DESC`,
      params
    );

    const total = result.rows.length;
    const opened = result.rows.filter((r: any) => r.state === "opened").length;
    const closed = result.rows.filter((r: any) => r.state === "closed").length;
    const avgDaysToClose = result.rows
      .filter((r: any) => r.closed_at)
      .reduce((sum: number, r: any) => {
        const days = (new Date(r.closed_at).getTime() - new Date(r.created_at).getTime()) / 86400000;
        return sum + days;
      }, 0) / Math.max(1, closed);

    return {
      ok: true,
      data: {
        issues: result.rows,
        summary: { total, opened, closed, avg_days_to_close: Math.round(avgDaysToClose * 10) / 10 },
      },
    };
  });
}
