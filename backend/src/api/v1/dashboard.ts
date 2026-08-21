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
    const dateFromTs = new Date(Date.now() - periodDays * 86400000).toISOString();

    const cacheK = cacheKey("dashboard", user.userId, periodDays, allowedIds?.join(","));
    const cached = getCached<any>(cacheK);
    if (cached) return cached;

    const projectWhere = allowedIds !== null
      ? allowedIds.length > 0 ? `WHERE project_id = ANY($1)` : `WHERE 1=0`
      : "";
    const projectParams = allowedIds !== null ? [allowedIds] : [];
    const hasProjectFilter = projectParams.length > 0;
    const dateFrom = new Date(Date.now() - periodDays * 86400000).toISOString().slice(0, 10);

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

    // 1) Period-filtered summary from raw tables (mart_dashboard is all-time)
    const [periodSummary, activeProjectsResult, inactiveProjectsResult, activityResult, mrRaw] = await Promise.all([
      pool.query(
        `SELECT
          (SELECT COUNT(*)::int FROM projects ${projectWhere}) as projects,
          (SELECT COUNT(DISTINCT c.author_email)::int FROM commits c
           WHERE c.committed_date >= $${hasProjectFilter ? 2 : 1}
           ${hasProjectFilter ? "AND c.project_id = ANY($1)" : ""}) as contributors,
          (SELECT COUNT(*)::int FROM commits c
           WHERE c.committed_date >= $${hasProjectFilter ? 2 : 1}
           ${hasProjectFilter ? "AND c.project_id = ANY($1)" : ""}) as commits,
          (SELECT COUNT(*)::int FROM project_branches ${projectWhere}) as branches,
          (SELECT COUNT(*)::int FROM project_branches
           ${projectWhere} ${projectWhere ? "AND" : "WHERE"} NOT merged AND last_commit_date >= NOW() - INTERVAL '90 days') as active_branches,
          (SELECT COUNT(*)::int FROM project_branches
           ${projectWhere} ${projectWhere ? "AND" : "WHERE"} NOT merged AND (last_commit_date < NOW() - INTERVAL '90 days' OR last_commit_date IS NULL)) as stale_branches,
          (SELECT COUNT(*)::int FROM project_merge_requests
           WHERE created_at >= $${hasProjectFilter ? 2 : 1} ${hasProjectFilter ? "AND project_id = ANY($1)" : ""}) as mr_total,
          (SELECT COUNT(*)::int FROM project_merge_requests
           WHERE state = 'merged' AND created_at >= $${hasProjectFilter ? 2 : 1} ${hasProjectFilter ? "AND project_id = ANY($1)" : ""}) as mr_merged,
          (SELECT COUNT(*)::int FROM project_merge_requests
           WHERE state = 'opened' AND created_at >= $${hasProjectFilter ? 2 : 1} ${hasProjectFilter ? "AND project_id = ANY($1)" : ""}) as mr_opened,
          (SELECT COUNT(*)::int FROM project_pipelines
           WHERE created_at >= $${hasProjectFilter ? 2 : 1} ${hasProjectFilter ? "AND project_id = ANY($1)" : ""}) as deploy_total,
          (SELECT COUNT(*)::int FROM project_pipelines
           WHERE status = 'success' AND created_at >= $${hasProjectFilter ? 2 : 1} ${hasProjectFilter ? "AND project_id = ANY($1)" : ""}) as deploy_success,
          (SELECT COUNT(*)::int FROM project_pipelines
           WHERE status = 'failed' AND created_at >= $${hasProjectFilter ? 2 : 1} ${hasProjectFilter ? "AND project_id = ANY($1)" : ""}) as deploy_failed`,
        hasProjectFilter ? [allowedIds, dateFrom] : [dateFrom]
      ),
      pool.query(
        `SELECT project_id, label, tags, commits, contributors, last_commit
         FROM public_marts.mart_dashboard
         ${hasProjectFilter ? "WHERE project_id = ANY($1)" : "WHERE TRUE"}
         AND commits > 0
         ORDER BY commits DESC`,
        projectParams
      ),
      pool.query(
        `SELECT project_id, label, tags
         FROM public_marts.mart_dashboard
         ${hasProjectFilter ? "WHERE project_id = ANY($1)" : "WHERE TRUE"}
         AND commits = 0`,
        projectParams
      ),
      pool.query(
        `SELECT day,
                sum(commits)::int as commits,
                sum(merge_requests)::int as merge_requests,
                sum(pipelines)::int as pipelines
         FROM public_marts.mart_activity
         ${hasProjectFilter ? "WHERE project_id = ANY($1)" : "WHERE TRUE"}
         AND day >= $${hasProjectFilter ? 2 : 1}
         GROUP BY day ORDER BY day`,
        hasProjectFilter ? [...projectParams, dateFrom] : [dateFrom]
      ),
      pool.query(
        `SELECT p.label, p.tags,
                count(*)::int as total,
                count(*) filter (where state = 'merged')::int as merged,
                count(*) filter (where state = 'opened')::int as opened,
                count(*) filter (where state = 'closed')::int as closed
         FROM project_merge_requests pmr
         JOIN projects p ON p.id = pmr.project_id
         ${hasProjectFilter ? "WHERE pmr.project_id = ANY($1)" : "WHERE TRUE"}
         AND pmr.created_at >= $${hasProjectFilter ? 2 : 1}
         GROUP BY p.label, p.tags
         ORDER BY total DESC LIMIT 10`,
        hasProjectFilter ? [...projectParams, dateFrom] : [dateFrom]
      ),
    ]);

    // Fetch merged branches and closed MRs counts separately
    const [mergedBranchesResult, mrClosedResult, leadTimeResult, mttrResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int as cnt FROM project_merge_requests
         WHERE state = 'merged' AND created_at >= $1
         ${hasProjectFilter ? "AND project_id = ANY($2)" : ""}`,
        hasProjectFilter ? [dateFrom, allowedIds] : [dateFrom]
      ),
      pool.query(
        `SELECT COUNT(*)::int as cnt FROM project_merge_requests
         WHERE state = 'closed' AND created_at >= $1
         ${hasProjectFilter ? "AND project_id = ANY($2)" : ""}`,
        hasProjectFilter ? [dateFrom, allowedIds] : [dateFrom]
      ),
      // Lead time: avg seconds from MR created_at to merged_at
      pool.query(
        `SELECT AVG(EXTRACT(EPOCH FROM (merged_at - created_at)))::int as avg_lead_sec
         FROM project_merge_requests
         WHERE state = 'merged' AND merged_at IS NOT NULL AND created_at >= $1
         ${hasProjectFilter ? "AND project_id = ANY($2)" : ""}`,
        hasProjectFilter ? [dateFrom, allowedIds] : [dateFrom]
      ),
      // MTTR: avg time from pipeline failure to next success on same project/ref
      pool.query(
        `WITH failures AS (
           SELECT project_id, ref, finished_at
           FROM project_pipelines
           WHERE status = 'failed' AND finished_at IS NOT NULL AND created_at >= $1
           ${hasProjectFilter ? "AND project_id = ANY($2)" : ""}
         ),
         recoveries AS (
           SELECT f.project_id, f.ref, f.finished_at as fail_time,
                  MIN(p.finished_at) as recover_time
           FROM failures f
           JOIN project_pipelines p
             ON p.project_id = f.project_id AND p.ref = f.ref
            AND p.status = 'success' AND p.finished_at > f.finished_at
           GROUP BY f.project_id, f.ref, f.finished_at
         )
         SELECT AVG(EXTRACT(EPOCH FROM (recover_time - fail_time)))::int as avg_mttr_sec
         FROM recoveries
         WHERE EXTRACT(EPOCH FROM (recover_time - fail_time)) > 0
           AND EXTRACT(EPOCH FROM (recover_time - fail_time)) < 86400`,
        hasProjectFilter ? [dateFrom, allowedIds] : [dateFrom]
      ),
    ]);

    const m = periodSummary.rows[0] || {};
    if (!m.projects) return { ok: true, data: empty };

    const activeProjects = activeProjectsResult.rows.map((r: any) => ({
      id: r.project_id, label: r.label, tags: r.tags || [], commits: r.commits, contributors: r.contributors, lastCommit: r.last_commit,
    }));

    const inactiveProjects = inactiveProjectsResult.rows.map((r: any) => ({
      id: r.project_id, label: r.label, tags: r.tags || [],
    }));

    // 2) Contributor analytics — parallel directory fetch + DB queries
    const contributorProjectIds = allowedIds ?? (await pool.query("SELECT id FROM projects")).rows.map((r: any) => r.id);

    const [dir, contributorResult, inactiveContribResult] = await Promise.all([
      getContributorDirectory(),
      pool.query(
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
        [contributorProjectIds, dateFrom]
      ),
      pool.query(
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
        [contributorProjectIds, dateFrom, new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)]
      ),
    ]);

    const emailToName = buildEmailToNameMap(dir);
    const nameToFirstEmail = buildNameToEmailMap(dir);

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

    const inactiveContributors = inactiveContribResult.rows.map((r: any) => ({
      name: emailToName[r.author_email] || r.name || r.author_email,
      email: r.author_email,
      lastCommit: r.last_commit,
    }));

    // 3) Daily activity from mart_activity (already fetched in parallel above)
    const activityByDay = new Map<string, { commits: number; mergeRequests: number; pipelines: number }>();
    for (const r of activityResult.rows as any[]) {
      activityByDay.set(r.day, { commits: r.commits || 0, mergeRequests: r.merge_requests || 0, pipelines: r.pipelines || 0 });
    }
    const fullActivity: { date: string; commits: number; mergeRequests: number; pipelines: number }[] = [];
    const todayStr = new Date().toISOString().slice(0, 10);
    const startDate = new Date(dateFrom);
    const endDate = new Date(todayStr);
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      const day = activityByDay.get(ds) || { commits: 0, mergeRequests: 0, pipelines: 0 };
      fullActivity.push({ date: ds, commits: day.commits, mergeRequests: day.mergeRequests, pipelines: day.pipelines });
    }

    // 4) MR by project (already fetched in parallel above)
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
          mergedBranches: mergedBranchesResult.rows[0]?.cnt || 0,
          commits: m.commits,
          activeDays: activityResult.rows.length,
          mrOpened: m.mr_opened,
          mrMerged: m.mr_merged,
          mrClosed: mrClosedResult.rows[0]?.cnt || 0,
          deploysTotal: m.deploy_total,
          deploysSuccess: m.deploy_success,
          deploysFailed: m.deploy_failed,
        },
        dora: {
          deployFrequency: m.deploy_total > 0 ? Math.round((m.deploy_total / Math.max(1, Math.ceil((new Date(todayStr).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1)) * 100) / 100 : 0,
          avgLeadTimeSec: leadTimeResult.rows[0]?.avg_lead_sec || 0,
          failureRate: m.deploy_total > 0 ? Math.round((m.deploy_failed / m.deploy_total) * 10000) / 100 : 0,
          avgMttrMin: mttrResult.rows[0]?.avg_mttr_sec ? Math.round(mttrResult.rows[0].avg_mttr_sec / 60) : 0,
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
