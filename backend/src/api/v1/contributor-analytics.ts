import type { FastifyInstance } from "fastify";
import { requireAuth, requireAdmin, type JwtPayload } from "../../utils/auth.js";
import { collectProject } from "../../services/contributor-collector.js";
import { logCollectionError } from "../../utils/collection-error.js";
import { safeErrorMessage } from "../../utils/safe-error.js";
import {
  getContributors,
  getHeatmapData,
  getMetrics,
} from "../../db/contributor-repository.js";
import { getFilteredProjectIds } from "../../utils/project-filter.js";
import { getCached, setCache, cacheKey } from "../../utils/cache.js";
import { getPool } from "../../db/pool.js";

export async function contributorAnalyticsRoutes(app: FastifyInstance) {
  app.post<{
    Body: { project_id: number; date_from?: string; date_to?: string };
  }>("/api/v1/contributor-analytics/collect", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { project_id, date_from, date_to } = request.body;
    if (!project_id) {
      return reply.status(400).send({ ok: false, error: "project_id is required" });
    }

    try {
      const result = await collectProject(project_id, date_from, date_to);
      return { ok: true, data: result };
    } catch (err) {
      logCollectionError("collect_contributors", project_id, "MANUAL", safeErrorMessage(err), "manual");
      return reply.status(500).send({
        ok: false,
        error: safeErrorMessage(err),
      });
    }
  });

  app.get<{
    Querystring: { project_id?: string; project_ids?: string; date_from?: string; date_to?: string };
  }>("/api/v1/contributor-analytics", { preHandler: [requireAuth] }, async (request) => {
    const { project_id, project_ids, date_from, date_to } = request.query;
    const user = (request as any).user as JwtPayload;
    const allowedIds = await getFilteredProjectIds(user.userId);
    const ids = project_ids ? project_ids.split(",").map(Number).filter(Boolean) : undefined;
    const finalIds = allowedIds !== null ? (ids ? ids.filter((id) => allowedIds.includes(id)) : allowedIds) : ids;

    const cacheK = cacheKey("contributors", user.userId, finalIds?.join(","), date_from, date_to);
    const cached = getCached<any>(cacheK);
    if (cached) return cached;

    const contributors = await getContributors({
      project_id: project_id ? Number(project_id) : undefined,
      project_ids: finalIds,
      date_from,
      date_to,
    });
    const response = { ok: true, data: contributors };
    setCache(cacheK, response, 60_000);
    return response;
  });

  app.get<{
    Querystring: { project_id?: string; project_ids?: string; date_from?: string; date_to?: string };
  }>("/api/v1/contributor-analytics/heatmap", { preHandler: [requireAuth] }, async (request) => {
    const { project_id, project_ids, date_from, date_to } = request.query;
    const user = (request as any).user as JwtPayload;
    const allowedIds = await getFilteredProjectIds(user.userId);
    const ids = project_ids
      ? project_ids.split(",").map(Number).filter(Boolean)
      : project_id ? [Number(project_id)] : undefined;
    const finalIds = allowedIds !== null ? (ids ? ids.filter((id) => allowedIds.includes(id)) : allowedIds) : ids;

    const cacheK = cacheKey("heatmap", user.userId, finalIds?.join(","), date_from, date_to);
    const cached = getCached<any>(cacheK);
    if (cached) return cached;

    const data = await getHeatmapData(finalIds, date_from, date_to);
    const response = { ok: true, data };
    setCache(cacheK, response, 60_000);
    return response;
  });

  app.get<{
    Querystring: { project_id?: string; project_ids?: string; date_from?: string; date_to?: string };
  }>("/api/v1/contributor-analytics/metrics", { preHandler: [requireAuth] }, async (request) => {
    const { project_id, project_ids, date_from, date_to } = request.query;
    const user = (request as any).user as JwtPayload;
    const allowedIds = await getFilteredProjectIds(user.userId);
    const ids = project_ids ? project_ids.split(",").map(Number).filter(Boolean) : undefined;
    const finalIds = allowedIds !== null ? (ids ? ids.filter((id) => allowedIds.includes(id)) : allowedIds) : ids;

    const cacheK = cacheKey("metrics", user.userId, finalIds?.join(","), date_from, date_to);
    const cached = getCached<any>(cacheK);
    if (cached) return cached;

    const metrics = await getMetrics({
      project_id: project_id ? Number(project_id) : undefined,
      project_ids: finalIds,
      date_from,
      date_to,
    });
    const response = { ok: true, data: metrics };
    setCache(cacheK, response, 60_000);
    return response;
  });

  app.get<{
    Querystring: { project_ids?: string; date_from?: string; date_to?: string; contributor?: string; contributors?: string };
  }>("/api/v1/contributor-analytics/deploy-reliability", { preHandler: [requireAuth] }, async (request) => {
    const { project_ids, date_from, date_to, contributors } = request.query;
    const user = (request as any).user as JwtPayload;
    const allowedIds = await getFilteredProjectIds(user.userId);
    const ids = project_ids ? project_ids.split(",").map(Number).filter(Boolean) : undefined;
    const finalIds = allowedIds !== null ? (ids ? ids.filter((id) => allowedIds.includes(id)) : allowedIds) : ids;

    const cacheK = cacheKey("deploy-reliability", user.userId, finalIds?.join(","), date_from, date_to, contributors);
    const cached = getCached<any>(cacheK);
    if (cached) return cached;

    const pool = getPool();
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (finalIds && finalIds.length > 0) {
      conditions.push(`mr.project_id = ANY($${idx++})`);
      params.push(finalIds);
    }
    if (date_from) {
      conditions.push(`mr.created_at >= $${idx++}`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`mr.created_at <= $${idx++}`);
      params.push(date_to + "T23:59:59Z");
    }
    if (contributors) {
      const emails = contributors.split(",").map((e) => e.trim()).filter(Boolean);
      if (emails.length > 0) {
        conditions.push(`mr.author_email = ANY($${idx++})`);
        params.push(emails);
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `WITH mr_data AS (
        SELECT
          mr.author_email,
          mr.author_name,
          mr.project_id,
          mr.source_branch,
          mr.state as mr_state,
          mr.gitlab_iid
        FROM project_merge_requests mr
        ${where}
      ),
      pipeline_data AS (
        SELECT
          md.author_email,
          md.author_name,
          COUNT(DISTINCT md.gitlab_iid) FILTER (WHERE md.mr_state = 'merged') as total_merged_mrs,
          COUNT(DISTINCT p.gitlab_id) as total_pipelines,
          COUNT(DISTINCT p.gitlab_id) FILTER (WHERE p.status = 'success') as successful_pipelines,
          COUNT(DISTINCT p.gitlab_id) FILTER (WHERE p.status = 'failed') as failed_pipelines,
          COUNT(DISTINCT p.gitlab_id) FILTER (WHERE p.status IN ('success', 'failed')) as completed_pipelines,
          COUNT(DISTINCT md.gitlab_iid) FILTER (WHERE md.mr_state = 'merged' AND EXISTS (
            SELECT 1 FROM project_pipelines pp
            WHERE pp.project_id = md.project_id AND pp.ref = md.source_branch
              AND pp.status IN ('success', 'failed')
          )) as mrs_with_pipeline
        FROM mr_data md
        LEFT JOIN project_pipelines p ON p.project_id = md.project_id AND p.ref = md.source_branch
        GROUP BY md.author_email, md.author_name
      )
      SELECT
        author_email,
        author_name,
        total_merged_mrs,
        total_pipelines,
        successful_pipelines,
        failed_pipelines,
        completed_pipelines,
        CASE WHEN completed_pipelines > 0
          THEN ROUND((successful_pipelines::numeric / completed_pipelines) * 100, 1)
          ELSE 0
        END as deploy_success_rate,
        CASE WHEN total_merged_mrs > 0
          THEN ROUND((mrs_with_pipeline::numeric / total_merged_mrs) * 100, 1)
          ELSE 0
        END as pipeline_coverage_rate
      FROM pipeline_data
      ORDER BY successful_pipelines DESC`,
      params
    );

    // Resolve through contributor directory — group by display_name
    const dirResult = await pool.query("SELECT display_name, emails FROM contributor_directory");
    const emailToName: Record<string, string> = {};
    const nameToPrimaryEmail: Record<string, string> = {};
    for (const row of dirResult.rows) {
      for (const email of row.emails) {
        emailToName[email] = row.display_name;
      }
      if (row.emails && row.emails.length > 0) {
        nameToPrimaryEmail[row.display_name] = row.emails[0];
      }
    }

    const grouped: Record<string, any> = {};
    for (const r of result.rows) {
      const displayName = emailToName[r.author_email] || r.author_name || r.author_email;
      const primaryEmail = nameToPrimaryEmail[displayName] || r.author_email;
      if (grouped[displayName]) {
        grouped[displayName].total_merged_mrs += Number(r.total_merged_mrs);
        grouped[displayName].total_pipelines += Number(r.total_pipelines);
        grouped[displayName].successful_pipelines += Number(r.successful_pipelines);
        grouped[displayName].failed_pipelines += Number(r.failed_pipelines);
        grouped[displayName].completed_pipelines += Number(r.completed_pipelines);
      } else {
        grouped[displayName] = {
          email: primaryEmail,
          name: displayName,
          total_merged_mrs: Number(r.total_merged_mrs),
          total_pipelines: Number(r.total_pipelines),
          successful_pipelines: Number(r.successful_pipelines),
          failed_pipelines: Number(r.failed_pipelines),
          completed_pipelines: Number(r.completed_pipelines),
        };
      }
    }

    const response = {
      ok: true,
      data: Object.values(grouped).map((g: any) => ({
        ...g,
        deploy_success_rate: g.completed_pipelines > 0
          ? Math.round((g.successful_pipelines / g.completed_pipelines) * 1000) / 10
          : 0,
        pipeline_coverage_rate: g.total_merged_mrs > 0
          ? Math.round((g.completed_pipelines / g.total_merged_mrs) * 1000) / 10
          : 0,
      })),
    };
    setCache(cacheK, response, 60_000);
    return response;
  });
}
