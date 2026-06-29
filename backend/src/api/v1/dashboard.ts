import type { FastifyInstance } from "fastify";
import { requireAuth, type JwtPayload } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import { getFilteredProjectIds } from "../../utils/project-filter.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { period?: string };
  }>("/api/v1/dashboard", { preHandler: [requireAuth] }, async (request) => {
    const user = (request as any).user as JwtPayload;
    const pool = getPool();
    const allowedIds = await getFilteredProjectIds(user.userId);
    const periodDays = Math.max(1, Math.min(365, parseInt(request.query.period || "30") || 30));

    const projectWhere = allowedIds !== null
      ? allowedIds.length > 0 ? `WHERE p.id = ANY($1)` : `WHERE 1=0`
      : "";
    const projectParams = allowedIds !== null ? [allowedIds] : [];

    const projectsResult = await pool.query(
      `SELECT p.id, p.label, p.tags FROM projects p ${projectWhere} ORDER BY p.label`,
      projectParams
    );
    const projects = projectsResult.rows;
    const projectIds = projects.map((p: any) => p.id);

    const empty = {
      period: periodDays,
      summary: { projects: 0, contributors: 0, branches: 0, activeBranches: 0, staleBranches: 0, mergedBranches: 0, commits: 0, activeDays: 0, mrOpened: 0, mrMerged: 0, mrClosed: 0, deploysTotal: 0, deploysSuccess: 0, deploysFailed: 0 },
      topContributors: [],
      inactiveContributors: [],
      activeProjects: [],
      inactiveProjects: [],
      recentActivity: [],
      mrByProject: [],
    };

    if (projectIds.length === 0) return { ok: true, data: empty };

    const dateFrom = new Date(Date.now() - periodDays * 86400000).toISOString().slice(0, 10);
    const staleMs = periodDays * 86400000;
    const now = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);

    const dirResult = await pool.query("SELECT display_name, emails FROM contributor_directory");
    const emailToName: Record<string, string> = {};
    const nameToFirstEmail: Record<string, string> = {};
    for (const row of dirResult.rows) {
      for (const email of row.emails) {
        emailToName[email] = row.display_name;
        if (!nameToFirstEmail[row.display_name]) nameToFirstEmail[row.display_name] = email;
      }
    }

    const activeProjectResult = await pool.query(
      `SELECT p.id, p.label, p.tags,
              COUNT(c.id)::int as commits,
              COUNT(DISTINCT c.author_email)::int as contributors,
              MAX(c.committed_date) as last_commit
       FROM projects p
       LEFT JOIN commits c ON c.project_id = p.id AND c.committed_date >= $2
       WHERE p.id = ANY($1)
       GROUP BY p.id, p.label, p.tags
       ORDER BY commits DESC`,
      [projectIds, dateFrom]
    );

    const activeProjects = activeProjectResult.rows
      .filter((r: any) => r.commits > 0)
      .map((r: any) => ({ id: r.id, label: r.label, tags: r.tags || [], commits: r.commits, contributors: r.contributors, lastCommit: r.last_commit }));

    const inactiveProjects = activeProjectResult.rows
      .filter((r: any) => r.commits === 0)
      .map((r: any) => ({ id: r.id, label: r.label, tags: r.tags || [] }));

    const contributorResult = await pool.query(
      `SELECT c.author_email, MAX(cn.author_name) as author_name,
              COUNT(*)::int as total_commits,
              SUM(c.additions + c.deletions)::int as total_changes,
              MAX(c.committed_date) as last_commit
       FROM commits c
       JOIN (
         SELECT author_email, MAX(author_name) as author_name
         FROM commits WHERE project_id = ANY($1) AND committed_date >= $2
         GROUP BY author_email
       ) cn ON cn.author_email = c.author_email
       WHERE c.project_id = ANY($1) AND c.committed_date >= $2
       GROUP BY c.author_email
       ORDER BY total_changes DESC`,
      [projectIds, dateFrom]
    );

    const totalContributorCount = await pool.query(
      `SELECT COUNT(DISTINCT author_email)::int as cnt FROM commits WHERE project_id = ANY($1) AND committed_date >= $2`,
      [projectIds, dateFrom]
    );

    const contribMap = new Map<string, { name: string; email: string; commits: number; changes: number; lastCommit: string }>();
    for (const c of contributorResult.rows as any[]) {
      const dn = emailToName[c.author_email] || null;
      const key = dn || c.author_email;
      const existing = contribMap.get(key);
      if (existing) {
        existing.commits += c.total_commits;
        existing.changes += c.total_changes;
        if (c.last_commit > existing.lastCommit) existing.lastCommit = c.last_commit;
      } else {
        contribMap.set(key, {
          name: dn ? `${nameToFirstEmail[dn]} (${dn})` : (c.author_name || c.author_email),
          email: c.author_email,
          commits: c.total_commits,
          changes: c.total_changes,
          lastCommit: c.last_commit,
        });
      }
    }
    const topContributors = Array.from(contribMap.values()).sort((a, b) => b.changes - a.changes).slice(0, 10);

    const inactiveContribResult = await pool.query(
      `SELECT DISTINCT c.author_email, MAX(c.author_name) as name,
              MAX(c.committed_date) as last_commit
       FROM commits c
       WHERE c.project_id = ANY($1)
         AND c.committed_date < $2
         AND c.committed_date >= $3
         AND NOT EXISTS (
           SELECT 1 FROM commits c2
           WHERE c2.author_email = c.author_email
             AND c2.project_id = ANY($1)
             AND c2.committed_date >= $2
         )
       GROUP BY c.author_email
       ORDER BY MAX(c.committed_date) DESC
       LIMIT 10`,
      [projectIds, dateFrom, new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)]
    );

    const inactiveContributors = inactiveContribResult.rows.map((r: any) => ({
      name: emailToName[r.author_email] || r.name || r.author_email,
      email: r.author_email,
      lastCommit: r.last_commit,
    }));

    const activityResult = await pool.query(
      `SELECT TO_CHAR(committed_date, 'YYYY-MM-DD') as day, COUNT(*)::int as cnt
       FROM commits WHERE project_id = ANY($1) AND committed_date >= $2
       GROUP BY day ORDER BY day`,
      [projectIds, dateFrom]
    );

    const activityMap = new Map<string, number>();
    for (const r of activityResult.rows as any[]) activityMap.set(r.day, r.cnt);
    const fullActivity: { date: string; commits: number }[] = [];
    const startDate = new Date(dateFrom);
    const endDate = new Date(todayStr);
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      fullActivity.push({ date: ds, commits: activityMap.get(ds) || 0 });
    }

    const mrTotal = await pool.query(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE state = 'merged')::int as merged,
         COUNT(*) FILTER (WHERE state = 'opened')::int as opened,
         COUNT(*) FILTER (WHERE state = 'closed')::int as closed
       FROM project_merge_requests
       WHERE project_id = ANY($1) AND created_at >= $2`,
      [projectIds, dateFrom]
    );
    const mr = mrTotal.rows[0] || { total: 0, merged: 0, opened: 0, closed: 0 };

    const mrByProjectResult = projectIds.length > 0 ? (await pool.query(
      `SELECT p.label, p.tags,
              COUNT(*)::int as total,
              COUNT(*) FILTER (WHERE pmr.state = 'merged')::int as merged,
              COUNT(*) FILTER (WHERE pmr.state = 'opened')::int as opened,
              COUNT(*) FILTER (WHERE pmr.state = 'closed')::int as closed
       FROM project_merge_requests pmr
       JOIN projects p ON p.id = pmr.project_id
       WHERE pmr.project_id = ANY($1) AND pmr.created_at >= $2
       GROUP BY p.label, p.tags
       ORDER BY total DESC LIMIT 10`,
      [projectIds, dateFrom]
    )).rows.map((r: any) => ({ label: r.label, tags: r.tags || [], total: r.total, merged: r.merged, opened: r.opened, closed: r.closed })) : [];

    const deployResult = projectIds.length > 0 ? await pool.query(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE status = 'success')::int as success,
         COUNT(*) FILTER (WHERE status = 'failed')::int as failed
       FROM project_deployments
       WHERE project_id = ANY($1) AND created_at >= $2`,
      [projectIds, dateFrom]
    ) : { rows: [{ total: 0, success: 0, failed: 0 }] };
    const deploys = deployResult.rows[0];

    return {
      ok: true,
      data: {
        period: periodDays,
        summary: {
          projects: projects.length,
          contributors: totalContributorCount.rows[0]?.cnt || 0,
          commits: activityResult.rows.reduce((s: number, r: any) => s + r.cnt, 0),
          activeDays: activityResult.rows.length,
          mrOpened: mr.opened,
          mrMerged: mr.merged,
          mrClosed: mr.closed,
          deploysTotal: deploys.total,
          deploysSuccess: deploys.success,
          deploysFailed: deploys.failed,
        },
        topContributors,
        inactiveContributors,
        activeProjects,
        inactiveProjects,
        recentActivity: fullActivity,
        mrByProject: mrByProjectResult,
      },
    };
  });
}
