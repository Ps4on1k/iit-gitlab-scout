import type { FastifyInstance } from "fastify";
import { requireAuth, requireAdmin, type JwtPayload } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import { getFilteredProjectIds } from "../../utils/project-filter.js";
import { collectDependenciesAudit } from "../../services/dependency-audit.js";
import { safeErrorMessage } from "../../utils/safe-error.js";

export async function dependencyAuditRoutes(app: FastifyInstance) {
  app.post<{
    Body: { project_id: number };
  }>("/api/v1/dependencies/collect", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { project_id } = request.body;
    if (!project_id) {
      return reply.status(400).send({ ok: false, error: "project_id is required" });
    }
    try {
      const result = await collectDependenciesAudit(project_id);
      return { ok: true, data: result };
    } catch (err) {
      return reply.status(500).send({ ok: false, error: safeErrorMessage(err) });
    }
  });

  app.get<{
    Querystring: { project_id?: string; project_ids?: string; tag?: string; tags?: string; source?: string };
  }>("/api/v1/dependencies", { preHandler: [requireAuth] }, async (request) => {
    const { project_id, project_ids, tag, tags, source } = request.query;
    const user = (request as any).user as JwtPayload;
    const pool = getPool();
    const allowedIds = await getFilteredProjectIds(user.userId);
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (allowedIds !== null) {
      if (allowedIds.length === 0) {
        return { ok: true, data: { dependencies: [], summary: { total: 0, outdated: 0, by_source: {} } } };
      }
      const requestedIds = project_ids ? project_ids.split(",").map(Number).filter(Boolean) : undefined;
      const finalIds = requestedIds ? requestedIds.filter((id) => allowedIds.includes(id)) : allowedIds;
      if (finalIds.length > 0) { conditions.push(`pda.project_id = ANY($${idx++})`); params.push(finalIds); }
    } else {
      if (project_ids) {
        const ids = project_ids.split(",").map(Number).filter(Boolean);
        if (ids.length > 0) { conditions.push(`pda.project_id = ANY($${idx++})`); params.push(ids); }
      } else if (project_id) {
        conditions.push(`pda.project_id = $${idx++}`);
        params.push(Number(project_id));
      }
    }
    if (tags) {
      const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
      if (tagList.length > 0) { conditions.push(`p.tags && $${idx++}`); params.push(tagList); }
    } else if (tag) {
      conditions.push(`p.tags @> ARRAY[$${idx++}]::text[]`);
      params.push(tag);
    }
    if (source) {
      conditions.push(`pda.source = $${idx++}`);
      params.push(source);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `SELECT pda.*, p.path as project_path, p.label as project_label, p.tags as project_tags
       FROM project_dependencies_audit pda
       JOIN projects p ON p.id = pda.project_id
       ${where}
       ORDER BY pda.name`,
      params
    );

    const total = result.rows.length;
    const outdated = result.rows.filter((r: any) => r.is_outdated).length;
    const bySource: Record<string, number> = {};
    for (const r of result.rows) {
      bySource[r.source] = (bySource[r.source] || 0) + 1;
    }

    return {
      ok: true,
      data: {
        dependencies: result.rows,
        summary: { total, outdated, by_source: bySource },
      },
    };
  });
}
