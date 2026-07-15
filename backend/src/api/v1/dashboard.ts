import type { FastifyInstance } from "fastify";
import { requireAuth, type JwtPayload } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import { getFilteredProjectIds } from "../../utils/project-filter.js";
import { getCached, setCache, cacheKey } from "../../utils/cache.js";
import { getContributorDirectory, buildEmailToNameMap, buildNameToEmailMap } from "../../utils/directory-cache.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { period?: string };
  }>("/api/v1/dashboard", { preHandler: [requireAuth] }, async (request) => {
    const user = (request as any).user as JwtPayload;
    const pool = getPool();
    const allowedIds = await getFilteredProjectIds(user.userId);
    const periodDays = Math.max(1, Math.min(365, parseInt(request.query.period || "30") || 30));

    const cacheK = cacheKey("dashboard", user.userId, periodDays, allowedIds?.join(","));
    const cached = getCached<any>(cacheK);
    if (cached) return cached;

    const projectWhere = allowedIds !== null
      ? allowedIds.length > 0 ? `WHERE project_id = ANY($1)` : `WHERE 1=0`
      : "";
    const projectParams = allowedIds !== null ? [allowedIds] : [];

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

    // 1) Read summary from mart_dashboard (per-project, aggregate on the fly)
    const martResult = await pool.query(
      `SELECT
        count(*) as projects,
        sum(contributors)::int as contributors,
        sum(commits)::int as commits,
        sum(total_branches)::int as branches,
        sum(active_branches)::int as active_branches,
        sum(stale_branches)::int as stale_branches,
        sum(mr_total)::int as mr_total,
        sum(mr_merged)::int as mr_merged,
        sum(mr_opened)::int as mr_opened,
        sum(deploy_total)::int as deploy_total,
        sum(deploy_success)::int as deploy_success,
        sum(deploy_failed)::int as deploy_failed
       FROM public_marts.mart_dashboard
       ${projectWhere}`,
      projectParams
    );

    const m = martResult.rows[0] || {};
    if (!m.projects) return { ok: true, data: empty };

    // 2) Active projects with commit counts (from mart)
    const activeProjectsResult = await pool.query(
      `SELECT project_id, label, tags, commits, contributors, last_commit
       FROM public_marts.mart_dashboard
       ${projectWhere}
       AND commits > 0
       ORDER BY commits DESC`,
      projectParams
    );
    const activeProjects = activeProjectsResult.rows.map((r: any) => ({
      id: r.project_id, label: r.label, tags: r.tags || [], commits: r.commits, contributors: r.contributors, lastCommit: r.last_commit,
    }));

    const inactiveProjectsResult = await pool.query(
      `SELECT project_id, label, tags
       FROM public_marts.mart_dashboard
       ${projectWhere}
       AND commits = 0`,
      projectParams
    );
    const inactiveProjects = inactiveProjectsResult.rows.map((r: any) => ({
      id: r.project_id, label: r.label, tags: r.tags || [],
    }));

    // 3) Contributor analytics (needs directory resolution, still from raw)
    const dir = await getContributorDirectory();
    const emailToName = buildEmailToNameMap(dir);
    const nameToFirstEmail = buildNameToEmailMap(dir);
    const dateFrom = new Date(Date.now() - periodDays * 86400000).toISOString().slice(0, 10);

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
      [allowedIds ?? (await pool.query("SELECT id FROM projects")).rows.map((r: any) => r.id), dateFrom]
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
    const topContributors = Array.from(contribMap.values()).sort((a, b) => b.changes - a.changes).slice(0, 15);

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
       LIMIT 50`,
      [allowedIds ?? [], dateFrom, new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)]
    );
    const inactiveContributors = inactiveContribResult.rows.map((r: any) => ({
      name: emailToName[r.author_email] || r.name || r.author_email,
      email: r.author_email,
      lastCommit: r.last_commit,
    }));

    // 4) Daily activity from mart_activity
    const activityResult = await pool.query(
      `SELECT day, sum(commits)::int as cnt
       FROM public_marts.mart_activity
       ${projectWhere}
       AND day >= $2
       GROUP BY day ORDER BY day`,
      [...(allowedIds ?? []), dateFrom]
    );
    const activityMap = new Map<string, number>();
    for (const r of activityResult.rows as any[]) activityMap.set(r.day, r.cnt);
    const fullActivity: { date: string; commits: number }[] = [];
    const todayStr = new Date().toISOString().slice(0, 10);
    const startDate = new Date(dateFrom);
    const endDate = new Date(todayStr);
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      fullActivity.push({ date: ds, commits: activityMap.get(ds) || 0 });
    }

    // 5) MR by project (from mart)
    const mrByProjectResult = activeProjects.map((p) => ({
      label: p.label, tags: p.tags, total: 0, merged: 0, opened: 0, closed: 0,
    }));

    const mrRaw = await pool.query(
      `SELECT p.label, p.tags,
              count(*)::int as total,
              count(*) filter (where state = 'merged')::int as merged,
              count(*) filter (where state = 'opened')::int as opened,
              count(*) filter (where state = 'closed')::int as closed
       FROM project_merge_requests pmr
       JOIN projects p ON p.id = pmr.project_id
       ${projectWhere.replace("project_id", "pmr.project_id").replace("WHERE", "WHERE")}
       AND pmr.created_at >= $2
       GROUP BY p.label, p.tags
       ORDER BY total DESC LIMIT 10`,
      [...projectParams, dateFrom]
    );
    const mrByProject = mrRaw.rows.map((r: any) => ({
      label: r.label, tags: r.tags || [], total: r.total, merged: r.merged, opened: r.opened, closed: r.closed,
    }));

    const response = {
      ok: true,
      data: {
        period: periodDays,
        summary: {
          projects: m.projects,
          contributors: m.contributors,
          branches: m.branches,
          activeBranches: m.active_branches,
          staleBranches: m.stale_branches,
          mergedBranches: 0,
          commits: m.commits,
          activeDays: activityResult.rows.length,
          mrOpened: m.mr_opened,
          mrMerged: m.mr_merged,
          mrClosed: 0,
          deploysTotal: m.deploy_total,
          deploysSuccess: m.deploy_success,
          deploysFailed: m.deploy_failed,
        },
        dora: {
          deployFrequency: m.deploy_total > 0 ? Math.round((m.deploy_total / Math.max(1, Math.ceil((new Date(todayStr).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1)) * 100) / 100 : 0,
          avgLeadTimeSec: 0,
          failureRate: m.deploy_total > 0 ? Math.round((m.deploy_failed / m.deploy_total) * 10000) / 100 : 0,
          avgMttrMin: 0,
        },
        topContributors,
        inactiveContributors,
        activeProjects,
        inactiveProjects,
        recentActivity: fullActivity,
        mrByProject,
      },
    };

    setCache(cacheK, response, 60_000);
    return response;
  });
}
