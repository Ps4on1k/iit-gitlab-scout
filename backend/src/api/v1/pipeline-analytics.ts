import type { FastifyInstance } from "fastify";
import { requireAuth, requireAdmin, type JwtPayload } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import { collectPipelines } from "../../services/pipeline-collector.js";
import { getFilteredProjectIds } from "../../utils/project-filter.js";

export async function pipelineAnalyticsRoutes(app: FastifyInstance) {
  app.post<{
    Body: { project_id: number };
  }>("/api/v1/pipelines/collect", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { project_id } = request.body;
    if (!project_id) return reply.status(400).send({ ok: false, error: "project_id is required" });
    try {
      const result = await collectPipelines(project_id);
      return { ok: true, data: result };
    } catch (err) {
      return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get<{
    Querystring: { project_ids?: string; date_from?: string; date_to?: string; status?: string };
  }>("/api/v1/pipelines", { preHandler: [requireAuth] }, async (request) => {
    const { project_ids, date_from, date_to, status } = request.query;
    const user = (request as any).user as JwtPayload;
    const pool = getPool();

    const allowedIds = await getFilteredProjectIds(user.userId);
    const requestedIds = project_ids ? project_ids.split(",").map(Number).filter(Boolean) : undefined;
    const finalIds = allowedIds !== null ? (requestedIds ? requestedIds.filter((id) => allowedIds.includes(id)) : allowedIds) : requestedIds;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (finalIds && finalIds.length > 0) { conditions.push(`pp.project_id = ANY($${idx++})`); params.push(finalIds); }
    if (date_from) { conditions.push(`pp.created_at >= $${idx++}`); params.push(date_from); }
    if (date_to) { conditions.push(`pp.created_at <= $${idx++}`); params.push(date_to + "T23:59:59Z"); }
    if (status) {
      const statuses = status.split(",").filter(Boolean);
      if (statuses.length === 1) { conditions.push(`pp.status = $${idx++}`); params.push(statuses[0]); }
      else if (statuses.length > 1) { conditions.push(`pp.status = ANY($${idx++})`); params.push(statuses); }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const summaryResult = await pool.query(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE status = 'success')::int as success,
         COUNT(*) FILTER (WHERE status = 'failed')::int as failed,
         COUNT(*) FILTER (WHERE status = 'running')::int as running,
         COUNT(*) FILTER (WHERE status = 'canceled')::int as canceled,
         AVG(duration) FILTER (WHERE status = 'success' AND duration IS NOT NULL)::int as avg_duration,
         MIN(duration) FILTER (WHERE status = 'success' AND duration IS NOT NULL)::int as min_duration,
         MAX(duration) FILTER (WHERE status = 'success' AND duration IS NOT NULL)::int as max_duration
       FROM project_pipelines pp ${where}`,
      params
    );

    const byDayResult = await pool.query(
      `SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD') as day,
              COUNT(*)::int as total,
              COUNT(*) FILTER (WHERE status = 'success')::int as success,
              COUNT(*) FILTER (WHERE status = 'failed')::int as failed
       FROM project_pipelines pp ${where}
       GROUP BY day ORDER BY day`,
      params
    );

    const byProjectResult = await pool.query(
      `SELECT p.label, p.tags,
              COUNT(*)::int as total,
              COUNT(*) FILTER (WHERE pp.status = 'success')::int as success,
              COUNT(*) FILTER (WHERE pp.status = 'failed')::int as failed,
              AVG(pp.duration) FILTER (WHERE pp.status = 'success' AND pp.duration IS NOT NULL)::int as avg_duration
       FROM project_pipelines pp
       JOIN projects p ON p.id = pp.project_id
       ${where}
       GROUP BY p.label, p.tags
       ORDER BY total DESC
       LIMIT 10`,
      params
    );

    const byRefResult = await pool.query(
      `SELECT pp.ref,
              COUNT(*)::int as total,
              COUNT(*) FILTER (WHERE pp.status = 'success')::int as success,
              COUNT(*) FILTER (WHERE pp.status = 'failed')::int as failed
       FROM project_pipelines pp ${where}
       GROUP BY pp.ref
       ORDER BY total DESC
       LIMIT 10`,
      params
    );

    const durationWhere = [...conditions, `pp.status = 'success'`, `pp.duration IS NOT NULL`];
    const durationSql = durationWhere.length > 0 ? `WHERE ${durationWhere.join(" AND ")}` : "";
    const durationDistResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE duration < 60)::int as under_1min,
         COUNT(*) FILTER (WHERE duration >= 60 AND duration < 300)::int as min_1_5,
         COUNT(*) FILTER (WHERE duration >= 300 AND duration < 900)::int as min_5_15,
         COUNT(*) FILTER (WHERE duration >= 900 AND duration < 3600)::int as min_15_60,
         COUNT(*) FILTER (WHERE duration >= 3600)::int as over_1hour
       FROM project_pipelines pp
       ${durationSql}`,
      params
    );

    return {
      ok: true,
      data: {
        summary: summaryResult.rows[0],
        byDay: byDayResult.rows.map((r: any) => ({ date: r.day, total: r.total, success: r.success, failed: r.failed })),
        byProject: byProjectResult.rows.map((r: any) => ({ label: r.label, tag: r.tag, total: r.total, success: r.success, failed: r.failed, avgDuration: Number(r.avg_duration) || 0 })),
        byRef: byRefResult.rows.map((r: any) => ({ ref: r.ref, total: r.total, success: r.success, failed: r.failed })),
        durationDistribution: durationDistResult.rows[0],
      },
    };
  });
}
