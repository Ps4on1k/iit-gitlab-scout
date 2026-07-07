import type { FastifyInstance } from "fastify";
import { requireAuth, type JwtPayload } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import { getFilteredProjectIds } from "../../utils/project-filter.js";
import { getCached, setCache, cacheKey } from "../../utils/cache.js";

export async function executiveReportRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: {
      project_ids?: string;
      tags?: string;
      date_from?: string;
      date_to?: string;
      contributors?: string;
      title?: string;
    };
  }>("/api/v1/executive-report", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    if (user.role !== "admin" && user.role !== "manager") {
      return reply.status(403).send({ ok: false, error: "Access denied: admin or manager role required" });
    }

    const pool = getPool();
    const allowedIds = await getFilteredProjectIds(user.userId);

    let projectIds: number[];
    if (allowedIds !== null) {
      projectIds = allowedIds;
    } else {
      const all = await pool.query("SELECT id FROM projects");
      projectIds = all.rows.map((r: any) => r.id);
    }

    const { project_ids, tags, date_from, date_to, contributors, title } = request.query;
    const requestedIds = project_ids ? project_ids.split(",").map(Number).filter(Boolean) : undefined;
    const finalIds = requestedIds ? requestedIds.filter((id) => projectIds.includes(id)) : projectIds;

    if (finalIds.length === 0) {
      return { ok: true, data: emptyReport(date_from || "", date_to || "") };
    }

    const dateFrom = date_from || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const dateTo = date_to || new Date().toISOString().slice(0, 10);
    const periodDays = Math.max(1, Math.ceil((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1);

    const reportTitle = title || "Отчёт по проекту";
    const cacheK = cacheKey("exec-report", user.userId, finalIds.join(","), tags, dateFrom, dateTo, contributors, reportTitle);
    const cached = getCached<any>(cacheK);
    if (cached) return cached;

    const tagList = tags ? tags.split(",").filter(Boolean) : [];

    const tagFilter = tagList.length > 0
      ? await pool.query(
          `SELECT id FROM projects WHERE tags @> $1::text[] AND id = ANY($2)`,
          [tagList, finalIds]
        ).then((r) => r.rows.map((r: any) => r.id))
      : finalIds;

    const effectiveIds = tagFilter.length > 0 ? tagFilter : finalIds;

    const [
      projectsResult,
      contributorResult,
      branchResult,
      mrResult,
      deployResult,
      pipelineResult,
      activityResult,
      inactiveContribResult,
      doraLeadTime,
      doraMttr,
    ] = await Promise.all([
      pool.query(
        `SELECT p.id, p.label, p.tags,
                COUNT(c.id)::int as commits,
                COUNT(DISTINCT c.author_email)::int as contributors,
                MAX(c.committed_date) as last_commit
         FROM projects p
         LEFT JOIN commits c ON c.project_id = p.id AND c.committed_date >= $2
         WHERE p.id = ANY($1)
         GROUP BY p.id, p.label, p.tags
         ORDER BY commits DESC`,
        [effectiveIds, dateFrom]
      ),
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
        [effectiveIds, dateFrom]
      ),
      pool.query(
        `SELECT pb.merged, pb.last_commit_date
         FROM project_branches pb
         WHERE pb.project_id = ANY($1)`,
        [effectiveIds]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int as total,
           COUNT(*) FILTER (WHERE state = 'merged')::int as merged,
           COUNT(*) FILTER (WHERE state = 'opened')::int as opened,
           COUNT(*) FILTER (WHERE state = 'closed')::int as closed
         FROM project_merge_requests
         WHERE project_id = ANY($1) AND created_at >= $2`,
        [effectiveIds, dateFrom]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int as total,
           COUNT(*) FILTER (WHERE status = 'success')::int as success,
           COUNT(*) FILTER (WHERE status = 'failed')::int as failed
         FROM project_deployments
         WHERE project_id = ANY($1) AND created_at >= $2`,
        [effectiveIds, dateFrom]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int as total,
           COUNT(*) FILTER (WHERE status = 'success')::int as success,
           COUNT(*) FILTER (WHERE status = 'failed')::int as failed,
           AVG(duration) FILTER (WHERE status = 'success' AND duration IS NOT NULL)::int as avg_duration
         FROM project_pipelines
         WHERE project_id = ANY($1) AND created_at >= $2`,
        [effectiveIds, dateFrom]
      ),
      pool.query(
        `SELECT TO_CHAR(committed_date, 'YYYY-MM-DD') as day, COUNT(*)::int as cnt
         FROM commits WHERE project_id = ANY($1) AND committed_date >= $2
         GROUP BY day ORDER BY day`,
        [effectiveIds, dateFrom]
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
         LIMIT 20`,
        [effectiveIds, dateFrom, new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)]
      ),
      pool.query(
        `SELECT AVG(EXTRACT(EPOCH FROM (d.created_at - (d.raw_json->'deployable'->'commit'->>'committed_date')::timestamptz)))::int as avg_sec
         FROM project_deployments d
         WHERE d.project_id = ANY($1) AND d.status = 'success' AND d.created_at >= $2
           AND d.raw_json->'deployable'->'commit'->>'committed_date' IS NOT NULL`,
        [effectiveIds, dateFrom]
      ),
      pool.query(
        `WITH ordered AS (
           SELECT created_at, status,
                  LAG(created_at) OVER (ORDER BY created_at) as prev_created,
                  LAG(status) OVER (ORDER BY created_at) as prev_status
           FROM project_deployments
           WHERE project_id = ANY($1) AND created_at >= $2
         )
         SELECT AVG(EXTRACT(EPOCH FROM (created_at - prev_created)) / 60)::int as avg_min
         FROM ordered
         WHERE prev_status = 'failed' AND status = 'success'
           AND EXTRACT(EPOCH FROM (created_at - prev_created)) / 60 BETWEEN 0 AND 1440`,
        [effectiveIds, dateFrom]
      ),
    ]);

    const dirResult = await pool.query("SELECT display_name, emails FROM contributor_directory");
    const emailToName: Record<string, string> = {};
    for (const row of dirResult.rows) {
      for (const email of row.emails) {
        emailToName[email] = row.display_name;
      }
    }

    let totalBranches = 0, activeBranches = 0, staleBranches = 0, mergedBranches = 0;
    const staleMs = 90 * 86400000;
    const now = Date.now();
    for (const r of branchResult.rows) {
      totalBranches++;
      if (r.merged) { mergedBranches++; continue; }
      if (r.last_commit_date && (now - new Date(r.last_commit_date).getTime()) <= staleMs) activeBranches++;
      else staleBranches++;
    }

    const branchHealth = totalBranches > 0 ? Math.round((activeBranches / Math.max(1, totalBranches - mergedBranches)) * 100) : 0;

    const mr = mrResult.rows[0] || { total: 0, merged: 0, opened: 0, closed: 0 };
    const mergeRate = mr.total > 0 ? Math.round((mr.merged / mr.total) * 100) : 0;

    const deploys = deployResult.rows[0] || { total: 0, success: 0, failed: 0 };
    const deployFrequency = deploys.total > 0 ? Math.round((deploys.total / Math.max(1, periodDays)) * 100) / 100 : 0;
    const failureRate = deploys.total > 0 ? Math.round((deploys.failed / deploys.total) * 10000) / 100 : 0;

    const pipes = pipelineResult.rows[0] || { total: 0, success: 0, failed: 0, avg_duration: 0 };
    const pipelineSuccessRate = pipes.total > 0 ? Math.round((pipes.success / pipes.total) * 100) : 0;

    const activityMap = new Map<string, number>();
    for (const r of activityResult.rows) activityMap.set(r.day, r.cnt);
    const fullActivity: { date: string; commits: number }[] = [];
    const startDate = new Date(dateFrom);
    const endDate = new Date(dateTo);
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      fullActivity.push({ date: ds, commits: activityMap.get(ds) || 0 });
    }

    const weeklyActivity: { week: string; commits: number }[] = [];
    const weekMap = new Map<string, number>();
    for (const a of fullActivity) {
      const d = new Date(a.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const wk = weekStart.toISOString().slice(0, 10);
      weekMap.set(wk, (weekMap.get(wk) || 0) + a.commits);
    }
    for (const [week, commits] of weekMap) {
      weeklyActivity.push({ week, commits });
    }
    weeklyActivity.sort((a, b) => a.week.localeCompare(b.week));

    const peakWeek = weeklyActivity.reduce((max, w) => w.commits > max.commits ? w : max, { week: "", commits: 0 });

    const contribMap = new Map<string, { name: string; email: string; commits: number; changes: number; lastCommit: string }>();
    for (const c of contributorResult.rows) {
      const dn = emailToName[c.author_email] || null;
      const key = dn || c.author_email;
      const existing = contribMap.get(key);
      if (existing) {
        existing.commits += c.total_commits;
        existing.changes += c.total_changes;
        if (c.last_commit > existing.lastCommit) existing.lastCommit = c.last_commit;
      } else {
        contribMap.set(key, {
          name: dn || c.author_name || c.author_email,
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

    const activeProjects = projectsResult.rows
      .filter((r: any) => r.commits > 0)
      .map((r: any) => ({ id: r.id, label: r.label, tags: r.tags || [], commits: r.commits, contributors: r.contributors, lastCommit: r.last_commit }));

    const inactiveProjects = projectsResult.rows
      .filter((r: any) => r.commits === 0)
      .map((r: any) => ({ id: r.id, label: r.label, tags: r.tags || [] }));

    const totalCommits = fullActivity.reduce((s, a) => s + a.commits, 0);
    const activeDays = fullActivity.filter((a) => a.commits > 0).length;

    const response = {
      ok: true,
      data: {
        meta: {
          title: reportTitle,
          dateFrom,
          dateTo,
          periodDays,
          generatedAt: new Date().toISOString(),
          filters: {
            projectIds: effectiveIds,
            tags: tagList,
            contributors: contributors ? contributors.split(",").filter(Boolean) : [],
          },
        },
        summary: {
          projects: projectsResult.rows.length,
          activeProjects: activeProjects.length,
          inactiveProjects: inactiveProjects.length,
          contributors: contributorResult.rows.length,
          totalCommits,
          activeDays,
          avgCommitsPerDay: activeDays > 0 ? Math.round((totalCommits / activeDays) * 10) / 10 : 0,
        },
        health: {
          branchHealth,
          totalBranches,
          activeBranches,
          staleBranches,
          mergedBranches,
          pipelineSuccessRate,
          pipelineTotal: pipes.total,
          avgPipelineDuration: pipes.avg_duration || 0,
          mrTotal: mr.total,
          mrMerged: mr.merged,
          mrOpened: mr.opened,
          mrClosed: mr.closed,
          mergeRate,
          deployTotal: deploys.total,
          deploySuccess: deploys.success,
          deployFailed: deploys.failed,
          deployFrequency,
          failureRate,
          avgLeadTimeSec: doraLeadTime.rows[0]?.avg_sec || 0,
          avgMttrMin: doraMttr.rows[0]?.avg_min || 0,
        },
        contributors: topContributors,
        inactiveContributors,
        activeProjects,
        inactiveProjects,
        activity: {
          daily: fullActivity,
          weekly: weeklyActivity,
          peakWeek: peakWeek.commits > 0 ? peakWeek : null,
        },
      },
    };

    setCache(cacheK, response, 60_000);
    return response;
  });
}

function emptyReport(dateFrom: string, dateTo: string) {
  return {
    meta: {
      title: "Отчёт по проекту",
      dateFrom,
      dateTo,
      periodDays: 0,
      generatedAt: new Date().toISOString(),
      filters: { projectIds: [], tags: [], contributors: [] },
    },
    summary: {
      projects: 0, activeProjects: 0, inactiveProjects: 0,
      contributors: 0, totalCommits: 0, activeDays: 0, avgCommitsPerDay: 0,
    },
    health: {
      branchHealth: 0, totalBranches: 0, activeBranches: 0, staleBranches: 0, mergedBranches: 0,
      pipelineSuccessRate: 0, pipelineTotal: 0, avgPipelineDuration: 0,
      mrTotal: 0, mrMerged: 0, mrOpened: 0, mrClosed: 0, mergeRate: 0,
      deployTotal: 0, deploySuccess: 0, deployFailed: 0, deployFrequency: 0, failureRate: 0,
      avgLeadTimeSec: 0, avgMttrMin: 0,
    },
    contributors: [],
    inactiveContributors: [],
    activeProjects: [],
    inactiveProjects: [],
    activity: { daily: [], weekly: [], peakWeek: null },
  };
}
