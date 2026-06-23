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
      `SELECT p.id, p.label, p.tag FROM projects p ${projectWhere} ORDER BY p.label`,
      projectParams
    );
    const projects = projectsResult.rows;
    const projectIds = projects.map((p: any) => p.id);

    const empty = {
      summary: { projects: 0, contributors: 0, branches: 0, activeBranches: 0, staleBranches: 0, mergedBranches: 0, commits: 0, activeDays: 0 },
      topContributors: [],
      projectHealth: [],
      recentActivity: [],
      languageDistribution: [],
      branchStatusDistribution: [],
      branchesByProject: [],
    };

    if (projectIds.length === 0) return { ok: true, data: empty };

    const date90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

    const branchResult = await pool.query(
      `SELECT pb.merged, pb.last_commit_date, p.label as project_label
       FROM project_branches pb JOIN projects p ON p.id = pb.project_id
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

    const dirResult = await pool.query("SELECT display_name, emails FROM contributor_directory");
    const emailToName: Record<string, string> = {};
    const nameToFirstEmail: Record<string, string> = {};
    for (const row of dirResult.rows) {
      for (const email of row.emails) {
        emailToName[email] = row.display_name;
        if (!nameToFirstEmail[row.display_name]) nameToFirstEmail[row.display_name] = email;
      }
    }

    const contributorResult = await pool.query(
      `SELECT c.author_email, MAX(cn.author_name) as author_name,
              COUNT(*)::int as total_commits,
              SUM(c.additions + c.deletions)::int as total_changes
       FROM commits c
       JOIN (
         SELECT author_email, MAX(author_name) as author_name
         FROM commits WHERE project_id = ANY($1) AND committed_date >= $2
         GROUP BY author_email
       ) cn ON cn.author_email = c.author_email
       WHERE c.project_id = ANY($1) AND c.committed_date >= $2
       GROUP BY c.author_email
       ORDER BY total_changes DESC
       LIMIT 10`,
      [projectIds, date90]
    );

    const contribMap = new Map<string, { name: string; email: string; commits: number; changes: number }>();
    for (const c of contributorResult.rows as any[]) {
      const dn = emailToName[c.author_email] || null;
      const key = dn || c.author_email;
      const existing = contribMap.get(key);
      if (existing) {
        existing.commits += c.total_commits;
        existing.changes += c.total_changes;
      } else {
        contribMap.set(key, {
          name: dn ? `${nameToFirstEmail[dn]} (${dn})` : (c.author_name || c.author_email),
          email: c.author_email,
          commits: c.total_commits,
          changes: c.total_changes,
        });
      }
    }
    const topContributors = Array.from(contribMap.values()).sort((a, b) => b.changes - a.changes).slice(0, 10);

    const langResult = await pool.query(
      `SELECT language, SUM(percentage)::numeric(5,2) as total_pct
       FROM project_languages WHERE project_id = ANY($1)
       GROUP BY language ORDER BY total_pct DESC LIMIT 10`,
      [projectIds]
    );

    const activityResult = await pool.query(
      `SELECT TO_CHAR(committed_date, 'YYYY-MM-DD') as day, COUNT(*)::int as cnt
       FROM commits WHERE project_id = ANY($1) AND committed_date >= $2
       GROUP BY day ORDER BY day`,
      [projectIds, date90]
    );

    const activityMap = new Map<string, number>();
    for (const r of activityResult.rows as any[]) activityMap.set(r.day, r.cnt);
    const todayStr = new Date().toISOString().slice(0, 10);
    const fullActivity: { date: string; commits: number }[] = [];
    const startDate = new Date(date90);
    const endDate = new Date(todayStr);
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      fullActivity.push({ date: ds, commits: activityMap.get(ds) || 0 });
    }

    const projectHealth = projects.map((p: any) => {
      const pb = branchResult.rows.filter((b: any) => b.project_label === p.label);
      const total = pb.length;
      const merged = pb.filter((b: any) => b.merged).length;
      const active = pb.filter((b: any) => !b.merged && b.last_commit_date && (now - new Date(b.last_commit_date).getTime()) <= stale90).length;
      const stale = total - merged - active;
      const nonMerged = total - merged || 1;
      return { label: p.label, tag: p.tag, total, merged, active, stale, healthPct: Math.round((active / nonMerged) * 100) };
    });

    const topHealth = projectHealth.sort((a, b) => a.healthPct - b.healthPct).slice(0, 10);
    const topBranches = projectHealth.sort((a, b) => b.total - a.total).slice(0, 10);

    return {
      ok: true,
      data: {
        summary: {
          projects: projects.length,
          contributors: topContributors.length,
          branches: totalBranches,
          activeBranches,
          staleBranches,
          mergedBranches,
          commits: activityResult.rows.reduce((s: number, r: any) => s + r.cnt, 0),
          activeDays: activityResult.rows.length,
        },
        topContributors,
        projectHealth: topHealth,
        recentActivity: fullActivity,
        languageDistribution: langResult.rows.map((l: any) => ({ language: l.language, percentage: Number(l.total_pct) })),
        branchStatusDistribution: [
          { type: "Активные", value: activeBranches },
          { type: "Заброшенные", value: staleBranches },
          { type: "Замерженные", value: mergedBranches },
        ],
        branchesByProject: topBranches.map((p) => ({ label: p.label, total: p.total, active: p.active, stale: p.stale, merged: p.merged })),
      },
    };
  });
}
