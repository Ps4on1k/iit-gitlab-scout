import type { FastifyInstance } from "fastify";
import { requireAuth, requireAdmin } from "../../utils/auth.js";
import { collectStack } from "../../services/stack-collector.js";
import { getLanguages, getLanguageSummary } from "../../db/stack-repository.js";

export async function stackAnalyticsRoutes(app: FastifyInstance) {
  app.post<{
    Body: { project_id: number };
  }>("/api/v1/stack/collect", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { project_id } = request.body;
    if (!project_id) {
      return reply.status(400).send({ ok: false, error: "project_id is required" });
    }

    try {
      const result = await collectStack(project_id);
      return { ok: true, data: result };
    } catch (err) {
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
    const ids = project_ids ? project_ids.split(",").map(Number).filter(Boolean) : undefined;
    const tags = tag ? tag.split(",") : undefined;
    const langs = language ? language.split(",") : undefined;
    const data = await getLanguages({ project_ids: ids, tag: tags, language: langs });
    return { ok: true, data };
  });

  app.get<{
    Querystring: { project_ids?: string; tag?: string; language?: string };
  }>("/api/v1/stack/languages/summary", { preHandler: [requireAuth] }, async (request) => {
    const { project_ids, tag, language } = request.query;
    const ids = project_ids ? project_ids.split(",").map(Number).filter(Boolean) : undefined;
    const tags = tag ? tag.split(",") : undefined;
    const langs = language ? language.split(",") : undefined;
    const data = await getLanguageSummary({ project_ids: ids, tag: tags, language: langs });
    return { ok: true, data };
  });
}
