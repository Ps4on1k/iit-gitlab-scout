import type { FastifyInstance } from "fastify";
import { requireAuth, type JwtPayload } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import { getFilteredProjectIds } from "../../utils/project-filter.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/api/v1/dashboard", { preHandler: [requireAuth] }, async (request) => {
    const user = (request as any).user as JwtPayload;
    const pool = getPool();
    const allowedIds = await getFilteredProjectIds(user.userId);

    const projectWhere = allowedIds !== null
      ? allowedIds.length > 0 ? `WHERE p.id = ANY($1)` : `WHERE 1=0`
      : "";
    const projectParams = allowedIds !== null ? [allowedIds] : [];

    const projectsResult = await pool.query(
      `SELECT p.id, p.label, p.tag, p.description FROM projects p ${projectWhere} ORDER BY p.label`,
      projectParams
    );
    const projects = projectsResult.rows;
    const projectIds = projects.map((p: any) => p.id);

    if (projectIds.length === 0) {
      return {
        ok: true,
        data: {
          summary: { projects: 0, contributors: 0, branches: 0, activeBranches: 0, staleBranches: 0, mergedBranches: 0, commits: 0, activeDays: 0 },
          topContributors: [],
          projectHealth: [],
          recentActivity: [],
          languageDistribution: [],
        },
      };
    }

    const branchResult = await pool.query(
      `SELECT pb.merged, pb.last_commit_date, p.label as project_label, p.tag as project_tag
       FROM project_branches pb
       JOIN projects p ON p.id = pb.project_id
       WHERE pb.project_id = ANY($1)`,
      [projectIds]
    );

    const now = Date.now();
    const stale90 = 90 * 86400000;
    let totalBranches = 0, activeBranches = 0, staleBranches = 0, mergedBranches = 0;
    for (const r of branchResult.rows) {
      totalBranches++;
      if (r.merged) { mergedBranches++; continue; }
      if (r.last_commit_date && (now - new Date(r.last_commit_date).getTime()) <= stale90) activeBranches++;
      else staleBranches++;
    }

    const contributorResult = await pool.query(
      `SELECT author_email, MAX(author_name) as author_name,
              SUM(total_commits)::int as total_commits,
              SUM(total_changes)::int as total_changes
       FROM contributor_profiles
       WHERE project_id = ANY($1)
       GROUP BY author_email
       ORDER BY total_changes DESC
       LIMIT 5`,
      [projectIds]
    );

    const commitsResult = await pool.query(
      `SELECT COUNT(*)::int as total_commits,
              COUNT(DISTINCT TO_CHAR(committed_date, 'YYYY-MM-DD'))::int as active_days
       FROM commits
       WHERE project_id = ANY($1)`,
      [projectIds]
    );

    const langResult = await pool.query(
      `SELECT language, SUM(percentage)::numeric(5,2) as total_pct
       FROM project_languages
       WHERE project_id = ANY($1)
       GROUP BY language
       ORDER BY total_pct DESC
       LIMIT 10`,
      [projectIds]
    );

    const activityResult = await pool.query(
      `SELECT TO_CHAR(committed_date, 'YYYY-MM-DD') as day, COUNT(*)::int as cnt
       FROM commits
       WHERE project_id = ANY($1)
         AND committed_date >= now() - interval '30 days'
       GROUP BY day
       ORDER BY day`,
      [projectIds]
    );

    const projectHealth = projects.map((p: any) => {
      const pBranches = branchResult.rows.filter((b: any) => b.project_label === p.label);
      const total = pBranches.length;
      const merged = pBranches.filter((b: any) => b.merged).length;
      const active = pBranches.filter((b: any) => !b.merged && b.last_commit_date && (now - new Date(b.last_commit_date).getTime()) <= stale90).length;
      const stale = total - merged - active;
      const nonMerged = total - merged || 1;
      const healthPct = Math.round((active / nonMerged) * 100);
      return { label: p.label, tag: p.tag, total, merged, active, stale, healthPct };
    });

    return {
      ok: true,
      data: {
        summary: {
          projects: projects.length,
          contributors: contributorResult.rows.length,
          branches: totalBranches,
          activeBranches,
          staleBranches,
          mergedBranches,
          commits: commitsResult.rows[0]?.total_commits || 0,
          activeDays: commitsResult.rows[0]?.active_days || 0,
        },
        topContributors: contributorResult.rows.map((c: any) => ({
          email: c.author_email,
          name: c.author_name,
          commits: c.total_commits,
          changes: c.total_changes,
        })),
        projectHealth,
        recentActivity: activityResult.rows.map((r: any) => ({ date: r.day, commits: r.cnt })),
        languageDistribution: langResult.rows.map((l: any) => ({ language: l.language, percentage: Number(l.total_pct) })),
      },
    };
  });
}
