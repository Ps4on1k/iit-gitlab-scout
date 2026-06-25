import type { FastifyInstance } from "fastify";
import { requireAuth, requireAdmin, type JwtPayload } from "../../utils/auth.js";
import { collectProject } from "../../services/contributor-collector.js";
import { logCollectionError } from "../../utils/collection-error.js";
import {
  getContributors,
  getHeatmapData,
  getMetrics,
} from "../../db/contributor-repository.js";
import { getFilteredProjectIds } from "../../utils/project-filter.js";

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
      logCollectionError("collect_contributors", project_id, "MANUAL", err instanceof Error ? err.message : String(err), "manual");
      return reply.status(500).send({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
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
    const contributors = await getContributors({
      project_id: project_id ? Number(project_id) : undefined,
      project_ids: finalIds,
      date_from,
      date_to,
    });
    return { ok: true, data: contributors };
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
    const data = await getHeatmapData(finalIds, date_from, date_to);
    return { ok: true, data };
  });

  app.get<{
    Querystring: { project_id?: string; project_ids?: string; date_from?: string; date_to?: string };
  }>("/api/v1/contributor-analytics/metrics", { preHandler: [requireAuth] }, async (request) => {
    const { project_id, project_ids, date_from, date_to } = request.query;
    const user = (request as any).user as JwtPayload;
    const allowedIds = await getFilteredProjectIds(user.userId);
    const ids = project_ids ? project_ids.split(",").map(Number).filter(Boolean) : undefined;
    const finalIds = allowedIds !== null ? (ids ? ids.filter((id) => allowedIds.includes(id)) : allowedIds) : ids;
    const metrics = await getMetrics({
      project_id: project_id ? Number(project_id) : undefined,
      project_ids: finalIds,
      date_from,
      date_to,
    });
    return { ok: true, data: metrics };
  });
}
