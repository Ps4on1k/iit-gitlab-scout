import type { FastifyInstance } from "fastify";
import { requireAuth, requireAdmin, type JwtPayload } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import { collectMergeRequests } from "../../services/mr-collector.js";
import { logCollectionError } from "../../utils/collection-error.js";
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
      logCollectionError("collect_merge_requests", project_id, "MANUAL", err instanceof Error ? err.message : String(err), "manual");
      return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get<{
    Querystring: { project_ids?: string; date_from?: string; date_to?: string; contributor?: string; contributors?: string };
  }>("/api/v1/mr-analytics", { preHandler: [requireAuth] }, async (request) => {
    const { project_ids, date_from, date_to, contributor, contributors } = request.query;
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
    if (contributor) {
      // contributor is email — try to resolve to name via directory
      const dirResult = await pool.query("SELECT display_name, emails FROM contributor_directory");
      let nameForFilter = contributor;
      for (const row of dirResult.rows) {
        if (row.emails.includes(contributor)) { nameForFilter = row.display_name; break; }
      }
      conditions.push(`(mr.author_email ILIKE $${idx} OR mr.author_name ILIKE $${idx})`);
      params.push(`%${nameForFilter}%`);
      idx++;
    } else if (contributors) {
      const emails = contributors.split(",").map((e) => e.trim()).filter(Boolean);
      if (emails.length > 0) {
        const dirResult = await pool.query("SELECT display_name, emails FROM contributor_directory");
        const resolvedNames: string[] = [];
        for (const email of emails) {
          let found = false;
          for (const row of dirResult.rows) {
            if (row.emails.includes(email)) { resolvedNames.push(row.display_name); found = true; break; }
          }
          if (!found) resolvedNames.push(email);
        }
        const placeholders = resolvedNames.map(() => `$${idx++}`).join(", ");
        conditions.push(`(mr.author_email = ANY($${idx}) OR mr.author_name IN (${placeholders}))`);
        params.push(emails);
        params.push(...resolvedNames);
      }
    }

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

    const byDayResult = await pool.query(
      `SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD') as day, COUNT(*)::int as total,
              COUNT(*) FILTER (WHERE state = 'merged')::int as merged
       FROM project_merge_requests mr ${where}
       GROUP BY day ORDER BY day`,
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

    // Resolve names to emails via contributor directory
    const dirResult = await pool.query("SELECT display_name, emails FROM contributor_directory");
    const nameToEmail: Record<string, string> = {};
    for (const row of dirResult.rows) {
      for (const email of row.emails) {
        nameToEmail[row.display_name.toLowerCase()] = email;
      }
    }

    // Also build contributor_profiles name→email fallback
    const profileResult = await pool.query("SELECT DISTINCT author_name, author_email FROM contributor_profiles WHERE author_name IS NOT NULL AND author_name != ''");
    const profileNameToEmail: Record<string, string> = {};
    for (const row of profileResult.rows) {
      const name = row.author_name?.toLowerCase();
      if (name && !profileNameToEmail[name]) profileNameToEmail[name] = row.author_email;
    }

    const resolveEmail = (name: string): string => {
      const lower = name.toLowerCase();
      return nameToEmail[lower] || profileNameToEmail[lower] || "";
    };

    return {
      ok: true,
      data: {
        summary: summaryResult.rows[0],
        byDay: byDayResult.rows.map((r: any) => ({ date: r.day, total: r.total, merged: r.merged })),
        topAuthors: topAuthorsResult.rows.map((r: any) => ({
          name: r.author_name || r.author_email,
          email: r.author_email || resolveEmail(r.author_name || ""),
          total: r.total, merged: r.merged,
        })),
        topReviewers: topReviewersResult.rows.map((r: any) => ({
          name: r.reviewer,
          email: resolveEmail(r.reviewer || ""),
          reviews: r.reviews,
        })),
        avgMergeTime: avgMergeTimeByProject.rows.map((r: any) => ({ label: r.label, avgDays: Number(r.avg_days) })),
      },
    };
  });
}
