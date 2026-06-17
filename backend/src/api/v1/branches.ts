import type { FastifyInstance } from "fastify";
import { requireAuth, requireAdmin } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import { collectBranches } from "../../services/branch-collector.js";
import { decrypt } from "../../utils/crypto.js";
import { GitLabClient } from "../../services/gitlab-client.js";

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
    Params: { project_id: string };
    Querystring: { branch: string; page?: string };
  }>("/api/v1/branches/:project_id/commits", { preHandler: [requireAuth] }, async (request, reply) => {
    const { project_id } = request.params;
    const { branch, page } = request.query;
    if (!branch) {
      return reply.status(400).send({ ok: false, error: "branch query param is required" });
    }
    const pool = getPool();
    const projResult = await pool.query("SELECT id, path, token_encrypted, base_url FROM projects WHERE id = $1", [Number(project_id)]);
    const proj = projResult.rows[0];
    if (!proj) return reply.status(404).send({ ok: false, error: "Project not found" });

    try {
      const token = decrypt(proj.token_encrypted);
      const client = new GitLabClient({ token, baseUrl: proj.base_url });
      const pageNum = Number(page) || 1;
      const ref = encodeURIComponent(branch);
      const commits = await client.requestPaginated<any>(
        `/projects/${encodeURIComponent(proj.path)}/repository/branches/${ref}/commits?per_page=20&page=${pageNum}`
      );
      return { ok: true, data: { commits, page: pageNum } };
    } catch (err) {
      return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get<{
    Querystring: { project_id?: string; project_ids?: string; tag?: string; status?: string; search?: string; date_from?: string; date_to?: string };
  }>("/api/v1/branches", { preHandler: [requireAuth] }, async (request) => {
    const { project_id, project_ids, tag, status, search, date_from, date_to } = request.query;
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
    if (search) {
      conditions.push(`pb.name ILIKE $${idx++}`);
      params.push(`%${search}%`);
    }
    if (date_from) {
      conditions.push(`pb.last_commit_date >= $${idx++}`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`pb.last_commit_date <= $${idx++}`);
      params.push(date_to);
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
    const protectedCount = result.rows.filter((r: any) => r.protected).length;

    const avgDaysSinceCommit = (() => {
      const dates = result.rows.filter((r: any) => r.last_commit_date).map((r: any) => (Date.now() - new Date(r.last_commit_date).getTime()) / 86400000);
      return dates.length > 0 ? Math.round(dates.reduce((s, v) => s + v, 0) / dates.length) : 0;
    })();

    const perProject = (() => {
      const map = new Map<number, { label: string; tag: string; total: number; active: number; stale: number; merged: number }>();
      for (const r of result.rows as any[]) {
        let entry = map.get(r.project_id);
        if (!entry) { entry = { label: r.project_label, tag: r.project_tag, total: 0, active: 0, stale: 0, merged: 0 }; map.set(r.project_id, entry); }
        entry.total++;
        if (r.merged) entry.merged++;
        else if (r.last_commit_date && new Date(r.last_commit_date).getTime() > Date.now() - 90 * 86400000) entry.active++;
        else entry.stale++;
      }
      return Array.from(map.entries()).map(([id, s]) => ({ project_id: id, ...s }));
    })();

    return {
      ok: true,
      data: {
        branches: result.rows,
        summary: { total, active, stale, merged: mergedCount, protected: protectedCount, avgDaysSinceCommit, perProject },
      },
    };
  });
}
