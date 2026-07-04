import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import { z } from "zod";
import yamlLib from "js-yaml";
import { safeErrorMessage } from "../../utils/safe-error.js";

const timeEntrySchema = z.object({
  email: z.string().email(),
  hours: z.number().min(0).max(24),
  period_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  period_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  note: z.string().max(500).optional(),
});

const timeEntriesBulkSchema = z.object({
  entries: z.array(timeEntrySchema).min(1).max(1000),
});

export async function timeEntriesRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { email?: string; period_from?: string; period_to?: string };
  }>("/api/v1/time-entries", { preHandler: [requireAdmin] }, async (request) => {
    const { email, period_from, period_to } = request.query;
    const pool = getPool();
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (email) { conditions.push(`contributor_email = $${idx++}`); params.push(email); }
    if (period_from) { conditions.push(`period_from >= $${idx++}`); params.push(period_from); }
    if (period_to) { conditions.push(`period_to <= $${idx++}`); params.push(period_to); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `SELECT id, contributor_email, hours::float, period_from, period_to, note, created_at
       FROM time_entries ${where} ORDER BY period_from DESC, contributor_email`,
      params
    );
    return { ok: true, data: result.rows };
  });

  app.post<{
    Body: { entries: { email: string; hours: number; period_from: string; period_to: string; note?: string }[] };
  }>("/api/v1/time-entries", { preHandler: [requireAdmin] }, async (request, reply) => {
    const v = timeEntriesBulkSchema.safeParse(request.body);
    if (!v.success) {
      return reply.status(400).send({ ok: false, error: v.error.errors.map((e) => e.message).join(", ") });
    }
    const { entries } = v.data;

    const pool = getPool();
    const imported: any[] = [];
    const errors: { email: string; error: string }[] = [];

    for (const entry of entries) {
      if (!entry.email || !entry.hours || !entry.period_from || !entry.period_to) {
        errors.push({ email: entry.email || "unknown", error: "Missing email, hours, period_from, or period_to" });
        continue;
      }
      try {
        const result = await pool.query(
          `INSERT INTO time_entries (contributor_email, hours, period_from, period_to, note)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [entry.email, entry.hours, entry.period_from, entry.period_to, entry.note || ""]
        );
        imported.push({ id: result.rows[0].id, email: entry.email, hours: entry.hours, period_from: entry.period_from, period_to: entry.period_to });
      } catch (err) {
        errors.push({ email: entry.email, error: safeErrorMessage(err) });
      }
    }

    return { ok: true, data: { imported, errors, total: entries.length } };
  });

  app.delete<{
    Params: { id: string };
  }>("/api/v1/time-entries/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const pool = getPool();
    const result = await pool.query("DELETE FROM time_entries WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "Entry not found" });
    }
    return { ok: true, data: { deleted: true } };
  });

  app.delete("/api/v1/time-entries", { preHandler: [requireAdmin] }, async () => {
    const pool = getPool();
    const result = await pool.query("DELETE FROM time_entries");
    return { ok: true, data: { deleted: result.rowCount } };
  });

  app.get("/api/v1/time-entries/template", { preHandler: [requireAdmin] }, async () => {
    const template = `email,hours,period_from,period_to,note
ivan@company.com,160,2026-06-01,2026-06-30,Основной проект
ivan@company.com,40,2026-06-01,2026-06-30,Проект Б
petrov@company.com,176,2026-06-01,2026-06-30,`;
    return { ok: true, data: { csv: template } };
  });

  app.get("/api/v1/time-entries/summary", { preHandler: [requireAdmin] }, async (request) => {
    const pool = getPool();
    const result = await pool.query(
      `SELECT contributor_email,
              SUM(hours)::float as total_hours,
              MIN(period_from) as first_period,
              MAX(period_to) as last_period,
              COUNT(*)::int as entries_count
       FROM time_entries
       GROUP BY contributor_email
       ORDER BY total_hours DESC`
    );
    return { ok: true, data: result.rows };
  });
}
