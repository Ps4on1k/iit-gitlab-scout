import type { FastifyInstance } from "fastify";
import { requireAuth, requireAdmin, type JwtPayload } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import { collectMergeRequests } from "../../services/mr-collector.js";
import { getFilteredProjectIds } from "../../utils/project-filter.js";

export async function mrAnalyticsRoutes(app: FastifyInstance) {
  app.post<{
    Body: { project_id: number };
  }>("/api/v1/mr-analytics/collect", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { project_id } = request.body;
    if (!project_id) return reply.status(400).send({ ok: false, error: "project_id is required" });
    try {
      const result = await collectMergeRequests(project_id);
      return { ok: true, data: result };
    } catch (err) {
      return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get<{
    Querystring: { project_ids?: string; date_from?: string; date_to?: string };
  }>("/api/v1/mr-analytics", { preHandler: [requireAuth] }, async (request) => {
    const { project_ids, date_from, date_to } = request.query;
    const user = (request as any).user as JwtPayload;
    const pool = getPool();

    const allowedIds = await getFilteredProjectIds(user.userId);
    const requestedIds = project_ids ? project_ids.split(",").map(Number).filter(Boolean) : undefined;
    const finalIds = allowedIds !== null ? (requestedIds ? requestedIds.filter((id) => allowedIds.includes(id)) : allowedIds) : requestedIds;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (finalIds && finalIds.length > 0) { conditions.push(`mr.project_id = ANY($${idx++})`); params.push(finalIds); }
    if (date_from) { conditions.push(`mr.created_at >= $${idx++}`); params.push(date_from); }
    if (date_to) { conditions.push(`mr.created_at <= $${idx++}`); params.push(date_to + "T23:59:59Z"); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const summaryResult = await pool.query(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE state = 'merged')::int as merged,
         COUNT(*) FILTER (WHERE state = 'opened')::int as opened,
         COUNT(*) FILTER (WHERE state = 'closed')::int as closed,
         AVG(CASE WHEN merged_at IS NOT NULL THEN EXTRACT(EPOCH FROM (merged_at - created_at)) / 86400 END)::numeric(5,1) as avg_days_to_merge,
         AVG(approvals)::numeric(5,1) as avg_approvals,
         SUM(changes_count)::int as total_changes,
         SUM(comments_count)::int as total_comments
       FROM project_merge_requests mr ${where}`,
      params
    );

    const byWeekResult = await pool.query(
      `SELECT TO_CHAR(date_trunc('week', created_at), 'YYYY-MM-DD') as week, COUNT(*)::int as total,
              COUNT(*) FILTER (WHERE state = 'merged')::int as merged
       FROM project_merge_requests mr ${where}
       GROUP BY week ORDER BY week`,
      params
    );

    const topAuthorsResult = await pool.query(
      `SELECT author_name, author_email, COUNT(*)::int as total,
              COUNT(*) FILTER (WHERE state = 'merged')::int as merged
       FROM project_merge_requests mr ${where}
       GROUP BY author_name, author_email
       ORDER BY total DESC LIMIT 10`,
      params
    );

    const reviewersWhere = [...conditions, `reviewers != '{}'`];
    const reviewersSql = reviewersWhere.length > 0 ? `WHERE ${reviewersWhere.join(" AND ")}` : "";

    const topReviewersResult = await pool.query(
      `SELECT unnest(reviewers) as reviewer, COUNT(*)::int as reviews
       FROM project_merge_requests mr ${reviewersSql}
       GROUP BY reviewer ORDER BY reviews DESC LIMIT 10`,
      params
    );

    const avgMergeTimeByProject = await pool.query(
      `SELECT p.label, AVG(CASE WHEN mr.merged_at IS NOT NULL THEN EXTRACT(EPOCH FROM (mr.merged_at - mr.created_at)) / 86400 END)::numeric(5,1) as avg_days
       FROM project_merge_requests mr
       JOIN projects p ON p.id = mr.project_id ${where}
       GROUP BY p.label
       HAVING AVG(CASE WHEN mr.merged_at IS NOT NULL THEN EXTRACT(EPOCH FROM (mr.merged_at - mr.created_at)) / 86400 END) IS NOT NULL
       ORDER BY avg_days DESC LIMIT 10`,
      params
    );

    return {
      ok: true,
      data: {
        summary: summaryResult.rows[0],
        byWeek: byWeekResult.rows.map((r: any) => ({ week: r.week, total: r.total, merged: r.merged })),
        topAuthors: topAuthorsResult.rows.map((r: any) => ({ name: r.author_name || r.author_email, email: r.author_email, total: r.total, merged: r.merged })),
        topReviewers: topReviewersResult.rows.map((r: any) => ({ name: r.reviewer, reviews: r.reviews })),
        avgMergeTime: avgMergeTimeByProject.rows.map((r: any) => ({ label: r.label, avgDays: Number(r.avg_days) })),
      },
    };
  });
}
