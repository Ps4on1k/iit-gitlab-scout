import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../utils/auth.js";
import { collectActivity } from "../../services/activity-collector.js";
import { getActivity } from "../../db/activity-repository.js";

export async function activityRoutes(app: FastifyInstance) {
  app.post<{
    Body: { project_id: number; date_from?: string; date_to?: string };
  }>("/api/v1/activity/collect", { preHandler: [requireAuth] }, async (request, reply) => {
    const { project_id, date_from, date_to } = request.body;
    if (!project_id) {
      return reply.status(400).send({ ok: false, error: "project_id is required" });
    }

    try {
      const result = await collectActivity(project_id, date_from, date_to);
      return { ok: true, data: { project_id, days: result.length } };
    } catch (err) {
      return reply.status(500).send({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get<{
    Querystring: { project_ids?: string; tag?: string; date_from?: string; date_to?: string; group_by?: string };
  }>("/api/v1/activity", { preHandler: [requireAuth] }, async (request) => {
    const { project_ids, tag, date_from, date_to, group_by } = request.query;
    const ids = project_ids ? project_ids.split(",").map(Number).filter(Boolean) : undefined;
    const tags = tag ? tag.split(",") : undefined;
    const data = await getActivity({
      project_ids: ids,
      tag: tags,
      date_from,
      date_to,
      group_by: group_by === "week" ? "week" : "day",
    });
    return { ok: true, data };
  });
}
