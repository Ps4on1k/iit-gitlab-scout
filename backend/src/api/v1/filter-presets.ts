import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import { z } from "zod";

const filterPresetSchema = z.object({
  name: z.string().min(1).max(200),
  filters: z.object({
    projectIds: z.array(z.number()).optional(),
    tags: z.array(z.string()).optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    contributors: z.array(z.string()).optional(),
  }),
  relative_days_from: z.number().int().min(0).max(365).optional(),
  relative_days_to: z.number().int().min(0).max(365).optional(),
});

export async function filterPresetRoutes(app: FastifyInstance) {
  app.get("/api/v1/filter-presets", { preHandler: [requireAuth] }, async (request) => {
    const user = (request as any).user;
    const pool = getPool();
    const result = await pool.query(
      "SELECT * FROM filter_presets WHERE user_id = $1 ORDER BY created_at DESC",
      [user.userId]
    );
    return { ok: true, data: result.rows };
  });

  app.post<{
    Body: { name: string; filters: any; relative_days_from?: number; relative_days_to?: number };
  }>("/api/v1/filter-presets", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = (request as any).user;
    const v = filterPresetSchema.safeParse(request.body);
    if (!v.success) {
      return reply.status(400).send({ ok: false, error: v.error.errors.map((e) => e.message).join(", ") });
    }
    const { name, filters, relative_days_from, relative_days_to } = v.data;
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO filter_presets (user_id, name, filters, relative_days_from, relative_days_to)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [user.userId, name.trim(), JSON.stringify(filters), relative_days_from ?? null, relative_days_to ?? null]
    );
    return { ok: true, data: result.rows[0] };
  });

  app.put<{
    Params: { id: string };
    Body: { name: string };
  }>("/api/v1/filter-presets/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = (request as any).user;
    const { id } = request.params;
    const { name } = request.body;
    if (!name?.trim()) {
      return reply.status(400).send({ ok: false, error: "Name is required" });
    }
    const pool = getPool();
    const result = await pool.query(
      "UPDATE filter_presets SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING *",
      [name.trim(), id, user.userId]
    );
    if (result.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "Preset not found" });
    }
    return { ok: true, data: result.rows[0] };
  });

  app.delete<{
    Params: { id: string };
  }>("/api/v1/filter-presets/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = (request as any).user;
    const { id } = request.params;
    const pool = getPool();
    const result = await pool.query(
      "DELETE FROM filter_presets WHERE id = $1 AND user_id = $2",
      [id, user.userId]
    );
    if (result.rowCount === 0) {
      return reply.status(404).send({ ok: false, error: "Preset not found" });
    }
    return { ok: true, data: { deleted: true } };
  });
}
