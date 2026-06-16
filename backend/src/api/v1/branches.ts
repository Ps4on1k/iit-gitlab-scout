import type { FastifyInstance } from "fastify";
import { requireAuth, requireAdmin } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import { collectBranches } from "../../services/branch-collector.js";

export async function branchRoutes(app: FastifyInstance) {
  app.post<{
    Body: { project_id: number };
  }>("/api/v1/branches/collect", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { project_id } = request.body;
    if (!project_id) {
      return reply.status(400).send({ ok: false, error: "project_id is required" });
    }
    try {
      const result = await collectBranches(project_id);
      return { ok: true, data: result };
    } catch (err) {
      return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get<{
    Querystring: { project_id?: string; project_ids?: string; tag?: string; status?: string };
  }>("/api/v1/branches", { preHandler: [requireAuth] }, async (request) => {
    const { project_id, project_ids, tag, status } = request.query;
    const pool = getPool();
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (project_ids) {
      const ids = project_ids.split(",").map(Number).filter(Boolean);
      if (ids.length > 0) { conditions.push(`pb.project_id = ANY($${idx++})`); params.push(ids); }
    } else if (project_id) {
      conditions.push(`pb.project_id = $${idx++}`);
      params.push(Number(project_id));
    }
    if (tag) {
      conditions.push(`p.tag = $${idx++}`);
      params.push(tag);
    }
    if (status === "active") {
      conditions.push(`pb.merged = false`);
      conditions.push(`pb.last_commit_date > now() - interval '90 days'`);
    } else if (status === "stale") {
      conditions.push(`pb.merged = false`);
      conditions.push(`(pb.last_commit_date IS NULL OR pb.last_commit_date <= now() - interval '90 days')`);
    } else if (status === "merged") {
      conditions.push(`pb.merged = true`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `SELECT pb.*, p.path as project_path, p.label as project_label, p.tag as project_tag
       FROM project_branches pb
       JOIN projects p ON p.id = pb.project_id
       ${where}
       ORDER BY pb.last_commit_date DESC NULLS LAST`,
      params
    );

    const total = result.rows.length;
    const active = result.rows.filter((r: any) => !r.merged && r.last_commit_date && new Date(r.last_commit_date).getTime() > Date.now() - 90 * 86400000).length;
    const stale = result.rows.filter((r: any) => !r.merged && (!r.last_commit_date || new Date(r.last_commit_date).getTime() <= Date.now() - 90 * 86400000)).length;
    const mergedCount = result.rows.filter((r: any) => r.merged).length;

    return {
      ok: true,
      data: {
        branches: result.rows,
        summary: { total, active, stale, merged: mergedCount },
      },
    };
  });
}
