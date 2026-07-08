import type { FastifyInstance } from "fastify";
import { requireAdmin, requireAuth } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";

export async function dependencyCatalogRoutes(app: FastifyInstance) {
  app.get("/api/v1/dependency-catalog", { preHandler: [requireAuth] }, async () => {
    const pool = getPool();
    const result = await pool.query("SELECT * FROM dependency_catalog ORDER BY ecosystem, language, framework");
    return { ok: true, data: result.rows };
  });

  app.post<{
    Body: { ecosystem: string; language: string; framework?: string; file_names: string[]; dependency_field?: string };
  }>("/api/v1/dependency-catalog", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { ecosystem, language, framework, file_names, dependency_field } = request.body;
    if (!ecosystem || !language || !file_names?.length) {
      return reply.status(400).send({ ok: false, error: "ecosystem, language, file_names are required" });
    }
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO dependency_catalog (ecosystem, language, framework, file_names, dependency_field)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [ecosystem, language, framework || null, file_names, dependency_field || null]
    );
    return { ok: true, data: result.rows[0] };
  });

  app.put<{
    Params: { id: string };
    Body: { ecosystem?: string; language?: string; framework?: string; file_names?: string[]; dependency_field?: string; is_active?: boolean };
  }>("/api/v1/dependency-catalog/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const pool = getPool();
    const existing = await pool.query("SELECT id FROM dependency_catalog WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "Entry not found" });
    }

    const ALLOWED_COLUMNS = new Set(["ecosystem", "language", "framework", "file_names", "dependency_field", "is_active"]);
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(request.body)) {
      if (val !== undefined && ALLOWED_COLUMNS.has(key)) {
        updates.push(`${key} = $${idx++}`);
        values.push(val);
      }
    }

    if (updates.length === 0) {
      return reply.status(400).send({ ok: false, error: "Nothing to update" });
    }
    updates.push("updated_at = now()");
    values.push(id);

    const result = await pool.query(
      `UPDATE dependency_catalog SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    return { ok: true, data: result.rows[0] };
  });

  app.delete<{
    Params: { id: string };
  }>("/api/v1/dependency-catalog/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const pool = getPool();
    const result = await pool.query("DELETE FROM dependency_catalog WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "Entry not found" });
    }
    return { ok: true, data: { deleted: true } };
  });
}
