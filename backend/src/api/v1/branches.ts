import type { FastifyInstance } from "fastify";
import { requireAuth, requireAdmin, type JwtPayload } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import { collectBranches } from "../../services/branch-collector.js";
import { getFilteredProjectIds } from "../../utils/project-filter.js";

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
    Querystring: { project_id?: string; project_ids?: string; tag?: string; status?: string; search?: string; date_from?: string; date_to?: string; contributor?: string };
  }>("/api/v1/branches", { preHandler: [requireAuth] }, async (request) => {
    const { project_id, project_ids, tag, status, search, date_from, date_to, contributor } = request.query;
    const user = (request as any).user as JwtPayload;
    const pool = getPool();
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    const allowedIds = await getFilteredProjectIds(user.userId);
    if (allowedIds !== null) {
      if (allowedIds.length === 0) {
        return { ok: true, data: { branches: [], summary: { total: 0, active: 0, stale: 0, merged: 0, protected: 0, avgDaysSinceCommit: 0, perProject: [] } } };
      }
      conditions.push(`pb.project_id = ANY($${idx++})`);
      params.push(allowedIds);
    }

    if (project_ids) {
      const ids = project_ids.split(",").map(Number).filter(Boolean);
      if (ids.length > 0) { conditions.push(`pb.project_id = ANY($${idx++})`); params.push(ids); }
    } else if (project_id) {
      conditions.push(`pb.project_id = $${idx++}`);
      params.push(Number(project_id));
    }
    if (tag) {
      const tags = tag.split(",").filter(Boolean);
      if (tags.length > 0) {
        conditions.push(`p.tags && $${idx++}`);
        params.push(tags);
      }
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
    if (contributor) {
      // Build all possible identifiers for this contributor
      const identifiers = new Set<string>([contributor]);

      // Check directory for all emails mapped to the same display_name
      const dirResult = await pool.query("SELECT display_name, emails FROM contributor_directory");
      for (const row of dirResult.rows) {
        if (row.emails.includes(contributor)) {
          for (const email of row.emails) identifiers.add(email);
          identifiers.add(row.display_name);
          break;
        }
        // Also check by name match
        if (row.display_name.toLowerCase().includes(contributor.toLowerCase())) {
          for (const email of row.emails) identifiers.add(email);
          identifiers.add(row.display_name);
        }
      }

      // Check contributor_profiles for same-name authors
      const profileResult = await pool.query(
        `SELECT DISTINCT author_name, author_email FROM contributor_profiles WHERE author_name ILIKE $1 OR author_email ILIKE $1`,
        [`%${contributor}%`]
      );
      for (const row of profileResult.rows) {
        identifiers.add(row.author_name);
        identifiers.add(row.author_email);
      }

      const idArray = Array.from(identifiers).filter(Boolean);
      if (idArray.length > 0) {
        conditions.push(`(pb.last_commit_author_email = ANY($${idx}) OR pb.last_commit_author = ANY($${idx}))`);
        params.push(idArray);
        idx++;
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `SELECT pb.*, p.path as project_path, p.label as project_label, p.tags as project_tags
       FROM project_branches pb
       JOIN projects p ON p.id = pb.project_id
       ${where}
       ORDER BY pb.last_commit_date DESC NULLS LAST`,
      params
    );

    const dirResult = await pool.query("SELECT display_name, emails FROM contributor_directory");
    const emailToName: Record<string, string> = {};
    const nameToFirstEmail: Record<string, string> = {};
    for (const row of dirResult.rows) {
      for (const email of row.emails) {
        emailToName[email] = row.display_name;
        if (!nameToFirstEmail[row.display_name]) {
          nameToFirstEmail[row.display_name] = email;
        }
      }
    }

    for (const r of result.rows as any[]) {
      const email = r.last_commit_author_email;
      if (email && emailToName[email]) {
        r.display_author = `${nameToFirstEmail[emailToName[email]]} (${emailToName[email]})`;
      } else {
        r.display_author = r.last_commit_author || email || "";
      }
    }

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
      const map = new Map<number, { label: string; tags: string[]; total: number; active: number; stale: number; merged: number }>();
      for (const r of result.rows as any[]) {
        let entry = map.get(r.project_id);
        if (!entry) { entry = { label: r.project_label, tags: r.project_tags || [], total: 0, active: 0, stale: 0, merged: 0 }; map.set(r.project_id, entry); }
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
