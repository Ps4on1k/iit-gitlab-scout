import type { FastifyInstance } from "fastify";
import { requireAuth, requireAdmin, type JwtPayload } from "../../utils/auth.js";
import { collectStack } from "../../services/stack-collector.js";
import { logCollectionError } from "../../utils/collection-error.js";
import { startCollect, finishCollect } from "../../utils/collect-tracker.js";
import { getLanguages, getLanguageSummary } from "../../db/stack-repository.js";
import { getFilteredProjectIds } from "../../utils/project-filter.js";

export async function stackAnalyticsRoutes(app: FastifyInstance) {
  app.post<{
    Body: { project_id: number };
  }>("/api/v1/stack/collect", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { project_id } = request.body;
    if (!project_id) {
      return reply.status(400).send({ ok: false, error: "project_id is required" });
    }

    startCollect(project_id, "stack", 1);
    try {
      const result = await collectStack(project_id);
      finishCollect(project_id, "stack");
      return { ok: true, data: result };
    } catch (err) {
      finishCollect(project_id, "stack", err instanceof Error ? err.message : String(err));
      logCollectionError("collect_stack", project_id, "MANUAL", err instanceof Error ? err.message : String(err), "manual");
      return reply.status(500).send({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get<{
    Querystring: { project_ids?: string; tag?: string; language?: string };
  }>("/api/v1/stack/languages", { preHandler: [requireAuth] }, async (request) => {
    const { project_ids, tag, language } = request.query;
    const user = (request as any).user as JwtPayload;
    const allowedIds = await getFilteredProjectIds(user.userId);
    const ids = project_ids ? project_ids.split(",").map(Number).filter(Boolean) : undefined;
    const finalIds = allowedIds !== null ? (ids ? ids.filter((id) => allowedIds.includes(id)) : allowedIds) : ids;
    const tags = tag ? tag.split(",") : undefined;
    const langs = language ? language.split(",") : undefined;
    const data = await getLanguages({ project_ids: finalIds, tag: tags, language: langs });
    return { ok: true, data };
  });

  app.get<{
    Querystring: { project_ids?: string; tag?: string; language?: string };
  }>("/api/v1/stack/languages/summary", { preHandler: [requireAuth] }, async (request) => {
    const { project_ids, tag, language } = request.query;
    const user = (request as any).user as JwtPayload;
    const allowedIds = await getFilteredProjectIds(user.userId);
    const ids = project_ids ? project_ids.split(",").map(Number).filter(Boolean) : undefined;
    const finalIds = allowedIds !== null ? (ids ? ids.filter((id) => allowedIds.includes(id)) : allowedIds) : ids;
    const tags = tag ? tag.split(",") : undefined;
    const langs = language ? language.split(",") : undefined;
    const data = await getLanguageSummary({ project_ids: finalIds, tag: tags, language: langs });
    return { ok: true, data };
  });
}
