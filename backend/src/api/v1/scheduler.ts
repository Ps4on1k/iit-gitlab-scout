import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";

export interface SchedulerTask {
  id: number;
  task_name: string;
  enabled: boolean;
  interval_minutes: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function schedulerRoutes(app: FastifyInstance) {
  app.get("/api/v1/scheduler", { preHandler: [requireAdmin] }, async () => {
    const pool = getPool();
    const result = await pool.query(
      "SELECT * FROM scheduler_settings ORDER BY id"
    );
    return { ok: true, data: result.rows };
  });

  app.put<{
    Params: { id: string };
    Body: { enabled?: boolean; interval_minutes?: number };
  }>("/api/v1/scheduler/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params;
    const { enabled, interval_minutes } = request.body;

    const pool = getPool();
    const existing = await pool.query("SELECT id FROM scheduler_settings WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "Task not found" });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (enabled !== undefined) {
      updates.push(`enabled = $${idx++}`);
      values.push(enabled);
    }
    if (interval_minutes !== undefined) {
      if (interval_minutes < 5) {
        return reply.status(400).send({ ok: false, error: "Minimum interval is 5 minutes" });
      }
      updates.push(`interval_minutes = $${idx++}`);
      values.push(interval_minutes);
    }

    if (updates.length === 0) {
      return reply.status(400).send({ ok: false, error: "Nothing to update" });
    }

    updates.push(`updated_at = now()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE scheduler_settings SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );

    return { ok: true, data: result.rows[0] };
  });

  app.get("/api/v1/scheduler/status", { preHandler: [requireAdmin] }, async () => {
    const pool = getPool();
    const result = await pool.query(
      "SELECT task_name, enabled, interval_minutes, last_run_at FROM scheduler_settings ORDER BY id"
    );
    return { ok: true, data: result.rows };
  });

  app.post("/api/v1/scheduler/reset-stats", { preHandler: [requireAdmin] }, async () => {
    const pool = getPool();
    const tables = [
      "commits",
      "contributor_profiles",
      "project_branches",
      "project_activity",
      "project_languages",
      "project_merge_requests",
    ];
    const cleared: string[] = [];
    for (const table of tables) {
      try {
        await pool.query(`DELETE FROM ${table}`);
        cleared.push(table);
      } catch { /* table may not exist */ }
    }
    await pool.query("UPDATE scheduler_settings SET last_run_at = NULL");
    return { ok: true, data: { cleared } };
  });
}
