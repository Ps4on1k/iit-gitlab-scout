import type { FastifyInstance } from "fastify";
import { requireAuth, type JwtPayload } from "../../utils/auth.js";
import { getFilteredProjectIds } from "../../utils/project-filter.js";
import { getCached, setCache, cacheKey } from "../../utils/cache.js";
import { getPool } from "../../db/pool.js";

interface ProjectRedFlags {
  stale_branches_pct: number;
  pipeline_failure_rate: number;
  mr_without_review_pct: number;
  long_living_mrs: number;
  deploy_frequency_monthly: number;
  has_deployments: boolean;
  total_flags: number;
}

interface ContributorRedFlag {
  author_email: string;
  author_name: string;
  total_commits: number;
  night_commits: number;
  night_ratio: number;
  night_commits_by_hour: Record<string, number>;
  missing_yellow_zone_days: number;
  total_active_days: number;
  yellow_zone_ratio: number;
  bus_factor_pct: number;
  large_mrs: number;
  direct_commits: number;
  disappeared: boolean;
  churn_pct: number;
  deploy_success_rate: number;
  pipeline_coverage_rate: number;
  weekend_commits: number;
  weekend_ratio: number;
  flag_score: number;
}

export async function redFlagsRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { project_ids?: string; date_from?: string; date_to?: string };
  }>("/api/v1/red-flags", { preHandler: [requireAuth] }, async (request) => {
    const { project_ids, date_from, date_to } = request.query;
    const user = (request as any).user as JwtPayload;
    const allowedIds = await getFilteredProjectIds(user.userId);
    const ids = project_ids ? project_ids.split(",").map(Number).filter(Boolean) : undefined;
    const finalIds = allowedIds !== null ? (ids ? ids.filter((id) => allowedIds.includes(id)) : allowedIds) : ids;

    const cacheK = cacheKey("red-flags", user.userId, finalIds?.join(","), date_from, date_to);
    const cached = getCached<any>(cacheK);
    if (cached) return cached;

    const pool = getPool();
    const projectFilter = finalIds && finalIds.length > 0;
    const projParam = projectFilter ? finalIds : [];

    const dateFrom = date_from || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const dateTo = date_to || new Date().toISOString().slice(0, 10);
    const periodDays = Math.max(1, Math.ceil((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1);

    // === PROJECT METRICS ===

    // P1: Stale branches
    const p1 = await pool.query(
      `SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE NOT merged AND (last_commit_date < NOW() - INTERVAL '90 days' OR last_commit_date IS NULL))::int as stale
      FROM project_branches
      ${projectFilter ? "WHERE project_id = ANY($1)" : ""}`,
      projectFilter ? [projParam] : []
    );
    const p1Row = p1.rows[0];
    const staleBranchesPct = p1Row.total > 0 ? Math.round((p1Row.stale / p1Row.total) * 10000) / 100 : 0;

    // P2: Pipeline failure rate
    const p2 = await pool.query(
      `SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'failed')::int as failed
      FROM project_pipelines
      WHERE created_at >= $1 AND created_at <= $2
      ${projectFilter ? "AND project_id = ANY($3)" : ""}`,
      projectFilter ? [dateFrom, dateTo + "T23:59:59Z", projParam] : [dateFrom, dateTo + "T23:59:59Z"]
    );
    const p2Row = p2.rows[0];
    const pipelineFailureRate = p2Row.total > 0 ? Math.round((p2Row.failed / p2Row.total) * 10000) / 100 : 0;

    // P3: MR without review
    const p3 = await pool.query(
      `SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE reviewers IS NULL OR array_length(reviewers, 1) = 0)::int as no_review
      FROM project_merge_requests
      WHERE state = 'merged' AND created_at >= $1 AND created_at <= $2
      ${projectFilter ? "AND project_id = ANY($3)" : ""}`,
      projectFilter ? [dateFrom, dateTo + "T23:59:59Z", projParam] : [dateFrom, dateTo + "T23:59:59Z"]
    );
    const p3Row = p3.rows[0];
    const mrWithoutReviewPct = p3Row.total > 0 ? Math.round((p3Row.no_review / p3Row.total) * 10000) / 100 : 0;

    // P4: Long-living MRs
    const p4 = await pool.query(
      `SELECT COUNT(*)::int as count
      FROM project_merge_requests
      WHERE state = 'opened' AND created_at < NOW() - INTERVAL '14 days'
      ${projectFilter ? "AND project_id = ANY($1)" : ""}`,
      projectFilter ? [projParam] : []
    );
    const longLivingMrs = p4.rows[0].count;

    // P5: Deploy frequency
    const p5 = await pool.query(
      `SELECT COUNT(*)::int as total
      FROM project_deployments
      WHERE created_at >= $1 AND created_at <= $2
      ${projectFilter ? "AND project_id = ANY($3)" : ""}`,
      projectFilter ? [dateFrom, dateTo + "T23:59:59Z", projParam] : [dateFrom, dateTo + "T23:59:59Z"]
    );
    const deployFrequency = Math.round((p5.rows[0].total / Math.max(1, periodDays / 30)) * 100) / 100;

    const projectFlags: ProjectRedFlags = {
      stale_branches_pct: staleBranchesPct,
      pipeline_failure_rate: pipelineFailureRate,
      mr_without_review_pct: mrWithoutReviewPct,
      long_living_mrs: longLivingMrs,
      deploy_frequency_monthly: deployFrequency,
      has_deployments: p5.rows[0].total > 0,
      total_flags: 0,
    };
    projectFlags.total_flags =
      (staleBranchesPct > 30 ? 3 : staleBranchesPct > 15 ? 1 : 0) +
      (pipelineFailureRate > 40 ? 3 : pipelineFailureRate > 20 ? 1 : 0) +
      (mrWithoutReviewPct > 50 ? 3 : mrWithoutReviewPct > 20 ? 1 : 0) +
      (longLivingMrs > 10 ? 3 : longLivingMrs > 3 ? 1 : 0) +
      (deployFrequency < 1 ? 3 : deployFrequency < 2 ? 1 : 0) +
      (!projectFlags.has_deployments ? 3 : 0);

    // === CONTRIBUTOR METRICS ===

    const commitConditions: string[] = [];
    const commitParams: any[] = [];
    let cIdx = 1;
    if (projectFilter) {
      commitConditions.push(`project_id = ANY($${cIdx++})`);
      commitParams.push(projParam);
    }
    commitConditions.push(`committed_date >= $${cIdx++}`);
    commitParams.push(dateFrom);
    commitConditions.push(`committed_date <= $${cIdx++}`);
    commitParams.push(dateTo + "T23:59:59Z");
    const commitWhere = `WHERE ${commitConditions.join(" AND ")}`;

    // C1+C2: Night + Yellow zone (existing)
    const nightResult = await pool.query(
      `SELECT author_email, MAX(author_name) AS author_name, COUNT(*)::int AS total_commits,
        COUNT(*) FILTER (
          WHERE EXTRACT(HOUR FROM committed_date AT TIME ZONE 'Europe/Moscow') >= 20
             OR EXTRACT(HOUR FROM committed_date AT TIME ZONE 'Europe/Moscow') < 8
        )::int AS night_commits
      FROM commits ${commitWhere}
      GROUP BY author_email HAVING COUNT(*) >= 3`,
      commitParams
    );

    const hourResult = await pool.query(
      `SELECT author_email,
        EXTRACT(HOUR FROM committed_date AT TIME ZONE 'Europe/Moscow')::int AS hour,
        COUNT(*)::int AS cnt
      FROM commits ${commitWhere}
      AND (EXTRACT(HOUR FROM committed_date AT TIME ZONE 'Europe/Moscow') >= 20
        OR EXTRACT(HOUR FROM committed_date AT TIME ZONE 'Europe/Moscow') < 8)
      GROUP BY author_email, EXTRACT(HOUR FROM committed_date AT TIME ZONE 'Europe/Moscow')`,
      commitParams
    );

    const yellowResult = await pool.query(
      `WITH contributor_days AS (
        SELECT author_email, committed_date::date AS day,
          BOOL_OR(EXTRACT(HOUR FROM committed_date AT TIME ZONE 'Europe/Moscow') >= 16
            AND EXTRACT(HOUR FROM committed_date AT TIME ZONE 'Europe/Moscow') < 19) AS has_yellow
        FROM commits ${commitWhere}
        GROUP BY author_email, committed_date::date
      )
      SELECT author_email, COUNT(*)::int AS total_days,
        COUNT(*) FILTER (WHERE NOT has_yellow)::int AS missing_days
      FROM contributor_days GROUP BY author_email`,
      commitParams
    );

    // C3: Bus factor (per-project, then max per contributor)
    const busResult = await pool.query(
      `WITH stats AS (
        SELECT project_id, author_email, COUNT(*) as commits
        FROM commits ${commitWhere}
        GROUP BY project_id, author_email
      ),
      totals AS (SELECT project_id, SUM(commits) as total FROM stats GROUP BY project_id)
      SELECT s.author_email, MAX(ROUND(s.commits::numeric / t.total * 100, 1)) as pct
      FROM stats s JOIN totals t ON t.project_id = s.project_id
      GROUP BY s.author_email
      HAVING MAX(s.commits::numeric / t.total) > 0.50`,
      commitParams
    );

    // C4: Large MRs
    const largeMrsResult = await pool.query(
      `SELECT author_email, COUNT(*)::int as large_mrs
      FROM project_merge_requests
      WHERE state IN ('merged', 'opened')
        AND changes_count > 500
        AND created_at >= $1
      ${projectFilter ? "AND project_id = ANY($2)" : ""}
      GROUP BY author_email`,
      projectFilter ? [dateFrom, projParam] : [dateFrom]
    );

    // C5: Direct commits to main
    const directResult = await pool.query(
      `SELECT author_email, COUNT(*)::int as cnt
      FROM commits ${commitWhere}
        AND branch IN ('main', 'master', 'develop', 'production')
      GROUP BY author_email HAVING COUNT(*) >= 2`,
      commitParams
    );

    // C6: Inactivity
    const disappearResult = await pool.query(
      `WITH periods AS (
        SELECT author_email, MAX(committed_date) as last_commit,
          COUNT(DISTINCT committed_date::date) as active_days
        FROM commits ${commitWhere}
        GROUP BY author_email
      )
      SELECT author_email FROM periods
      WHERE active_days >= 5
        AND last_commit < ($${cIdx}::date + (${Math.floor(periodDays * 0.75)} || ' days')::interval)`,
      [...commitParams, dateFrom]
    );

    // C7: Churn
    const churnResult = await pool.query(
      `WITH daily_net AS (
        SELECT author_email, committed_date::date as day,
          SUM(additions - deletions) as net
        FROM commits ${commitWhere}
        GROUP BY author_email, committed_date::date
      )
      SELECT author_email,
        COUNT(*) FILTER (WHERE net = 0)::int as zero_days,
        COUNT(*)::int as total_days,
        ROUND(COUNT(*) FILTER (WHERE net = 0)::numeric / COUNT(*) * 100, 1) as churn_pct
      FROM daily_net GROUP BY author_email HAVING COUNT(*) >= 5`,
      commitParams
    );

    // C9: Weekend activity (Saturday=6, Sunday=0)
    const weekendResult = await pool.query(
      `SELECT author_email,
        COUNT(*)::int as total_commits,
        COUNT(*) FILTER (WHERE EXTRACT(DOW FROM committed_date) IN (0, 6))::int as weekend_commits
      FROM commits ${commitWhere}
      GROUP BY author_email HAVING COUNT(*) >= 3`,
      commitParams
    );

    const weekendMap = new Map<string, { total: number; weekend: number }>();
    for (const row of weekendResult.rows) {
      weekendMap.set(row.author_email, { total: row.total_commits, weekend: row.weekend_commits });
    }

    // Build lookup maps
    const hourMap = new Map<string, Record<string, number>>();
    for (const row of hourResult.rows) {
      if (!hourMap.has(row.author_email)) hourMap.set(row.author_email, {});
      hourMap.get(row.author_email)![String(row.hour)] = row.cnt;
    }

    const yellowMap = new Map<string, { total_days: number; missing_days: number }>();
    for (const row of yellowResult.rows) {
      yellowMap.set(row.author_email, { total_days: row.total_days, missing_days: row.missing_days });
    }

    const busMap = new Map<string, number>();
    for (const row of busResult.rows) busMap.set(row.author_email, row.pct);

    const largeMrsMap = new Map<string, number>();
    for (const row of largeMrsResult.rows) largeMrsMap.set(row.author_email, row.large_mrs);

    const directMap = new Map<string, number>();
    for (const row of directResult.rows) directMap.set(row.author_email, row.cnt);

    const disappearSet = new Set(disappearResult.rows.map((r: any) => r.author_email));

    const churnMap = new Map<string, number>();
    for (const row of churnResult.rows) churnMap.set(row.author_email, row.churn_pct);

    // C8: Deploy reliability — success rate per contributor via MR→pipeline join
    const mrConditions: string[] = [];
    const mrParams: any[] = [];
    let mIdx = 1;
    if (projectFilter) {
      mrConditions.push(`mr.project_id = ANY($${mIdx++})`);
      mrParams.push(projParam);
    }
    mrConditions.push(`mr.created_at >= $${mIdx++}`);
    mrParams.push(dateFrom);
    mrConditions.push(`mr.state = 'merged'`);
    const mrWhere = `WHERE ${mrConditions.join(" AND ")}`;

    const deployReliabilityResult = await pool.query(
      `WITH mr_pipelines AS (
        SELECT
          mr.author_email,
          MAX(mr.author_name) as author_name,
          COUNT(DISTINCT mr.gitlab_iid) as total_merged_mrs,
          COUNT(DISTINCT p.gitlab_id) FILTER (WHERE p.status = 'success') as successful_pipelines,
          COUNT(DISTINCT p.gitlab_id) FILTER (WHERE p.status IN ('success', 'failed')) as completed_pipelines
        FROM project_merge_requests mr
        LEFT JOIN project_pipelines p ON p.project_id = mr.project_id AND p.ref = mr.source_branch
        ${mrWhere}
        GROUP BY mr.author_email
      )
      SELECT author_email, author_name,
        CASE WHEN completed_pipelines > 0
          THEN ROUND((successful_pipelines::numeric / completed_pipelines) * 100, 1)
          ELSE 0
        END as deploy_success_rate,
        CASE WHEN total_merged_mrs > 0
          THEN ROUND((CASE WHEN completed_pipelines > 0 THEN 1 ELSE 0 END::numeric / total_merged_mrs) * 100, 1)
          ELSE 0
        END as pipeline_coverage_rate
      FROM mr_pipelines`,
      mrParams
    );

    // Build deploy reliability map: author_email → deploy data (email is unique per person)
    const deployByEmail = new Map<string, { deploy_success_rate: number; pipeline_coverage_rate: number }>();
    for (const row of deployReliabilityResult.rows) {
      deployByEmail.set(row.author_email, {
        deploy_success_rate: Number(row.deploy_success_rate),
        pipeline_coverage_rate: Number(row.pipeline_coverage_rate),
      });
    }

    // Build contributor entries
    const contributors: ContributorRedFlag[] = nightResult.rows.map((row) => {
      const yellow = yellowMap.get(row.author_email) || { total_days: 0, missing_days: 0 };
      const nightRatio = row.total_commits > 0 ? Math.round((row.night_commits / row.total_commits) * 10000) / 100 : 0;
      const yellowRatio = yellow.total_days > 0 ? Math.round((yellow.missing_days / yellow.total_days) * 10000) / 100 : 0;
      const deployReliability = deployByEmail.get(row.author_email) || { deploy_success_rate: 0, pipeline_coverage_rate: 0 };

      // Calculate flag score (3=red, 1=yellow, 0=ok)
      let score = 0;
      if (nightRatio > 25) score += 3; else if (nightRatio > 10) score += 1;
      if (yellowRatio > 50) score += 3; else if (yellowRatio > 25) score += 1;
      const busPct = busMap.get(row.author_email) || 0;
      if (busPct > 70) score += 3; else if (busPct > 50) score += 1;
      const largeMrs = largeMrsMap.get(row.author_email) || 0;
      if (largeMrs > 3) score += 3; else if (largeMrs > 1) score += 1;
      const directCommits = directMap.get(row.author_email) || 0;
      if (directCommits > 5) score += 3; else if (directCommits > 2) score += 1;
      if (disappearSet.has(row.author_email)) score += 3;
      const churnPct = churnMap.get(row.author_email) || 0;
      if (churnPct > 40) score += 3; else if (churnPct > 25) score += 1;
      // C9: Weekend activity
      const weekend = weekendMap.get(row.author_email) || { total: 0, weekend: 0 };
      const weekendRatio = weekend.total > 0 ? Math.round((weekend.weekend / weekend.total) * 10000) / 100 : 0;
      if (weekendRatio > 30) score += 3; else if (weekendRatio > 15) score += 1;
      // C8: Deploy reliability
      if (deployReliability.deploy_success_rate > 0 && deployReliability.deploy_success_rate < 50) score += 3;
      else if (deployReliability.deploy_success_rate > 0 && deployReliability.deploy_success_rate < 75) score += 1;

      return {
        author_email: row.author_email,
        author_name: row.author_name,
        total_commits: row.total_commits,
        night_commits: row.night_commits,
        night_ratio: nightRatio,
        night_commits_by_hour: hourMap.get(row.author_email) || {},
        missing_yellow_zone_days: yellow.missing_days,
        total_active_days: yellow.total_days,
        yellow_zone_ratio: yellowRatio,
        bus_factor_pct: busPct,
        large_mrs: largeMrs,
        direct_commits: directCommits,
        disappeared: disappearSet.has(row.author_email),
        churn_pct: churnPct,
        deploy_success_rate: deployReliability.deploy_success_rate,
        pipeline_coverage_rate: deployReliability.pipeline_coverage_rate,
        weekend_commits: weekend.weekend,
        weekend_ratio: weekendRatio,
        flag_score: score,
      };
    });

    contributors.sort((a, b) => b.flag_score - a.flag_score);

    let criticalCount = 0;
    let warningCount = 0;
    for (const c of contributors) {
      if (c.flag_score >= 6) criticalCount++;
      else if (c.flag_score >= 2) warningCount++;
    }

    const response = {
      ok: true,
      data: {
        project: projectFlags,
        contributors,
        summary: {
          project_flags: projectFlags.total_flags,
          contributor_flags: contributors.filter((c) => c.flag_score > 0).length,
          critical_count: criticalCount,
          warning_count: warningCount,
        },
      },
    };

    setCache(cacheK, response, 60_000);
    return response;
  });
}
