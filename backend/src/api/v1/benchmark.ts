import type { FastifyInstance } from "fastify";
import { requireAuth, type JwtPayload } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";

export async function benchmarkRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { tags: string; date_from?: string; date_to?: string };
  }>("/api/v1/benchmark", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    if (user.role !== "admin" && user.role !== "manager") {
      return reply.status(403).send({ ok: false, error: "Access denied: admin or manager role required" });
    }

    const { tags, date_from, date_to } = request.query;
    if (!tags) {
      return { ok: true, data: { groups: [], availableTags: [] } };
    }

    const pool = getPool();
    const tagList = tags.split(",").filter(Boolean);
    const dateFrom = date_from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dateTo = date_to || new Date().toISOString().slice(0, 10);
    const date90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

    const allTags = await pool.query(
      `SELECT DISTINCT unnest(tags) as tag FROM projects WHERE tags IS NOT NULL AND array_length(tags, 1) > 0 ORDER BY tag`
    );

    const groups: any[] = [];

    for (const tag of tagList) {
      const projResult = await pool.query(
        `SELECT id, label FROM projects WHERE tags @> ARRAY[$1]::text[]`,
        [tag]
      );
      const projectIds = projResult.rows.map((p: any) => p.id);
      if (projectIds.length === 0) {
        groups.push({ tag, projectCount: 0, dora: null, commits: null, pipelines: null, mr: null, branches: null, topContributors: [] });
        continue;
      }

      const doraResult = await pool.query(
        `SELECT
           COUNT(*)::int as total,
           COUNT(*) FILTER (WHERE status = 'success')::int as success,
           COUNT(*) FILTER (WHERE status = 'failed' OR pipeline_status = 'failed')::int as failed,
           COUNT(*) FILTER (WHERE status = 'canceled')::int as canceled
         FROM project_deployments
         WHERE project_id = ANY($1) AND created_at >= $2`,
        [projectIds, dateFrom]
      );
      const dora = doraResult.rows[0];
      const doraFailRate = dora.total > 0 ? Math.round((dora.failed / dora.total) * 10000) / 100 : 0;
      const deployDays = Math.max(1, Math.ceil((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1);
      const deployFreq = Math.round((dora.total / deployDays) * 100) / 100;

      const leadTimeResult = await pool.query(
        `SELECT AVG(EXTRACT(EPOCH FROM (d.created_at - (d.raw_json->'deployable'->'commit'->>'committed_date')::timestamptz)))::int as avg_lead_sec
         FROM project_deployments d
         WHERE d.project_id = ANY($1) AND d.status = 'success' AND d.created_at >= $2
           AND d.raw_json->'deployable'->'commit'->>'committed_date' IS NOT NULL`,
        [projectIds, dateFrom]
      );
      const avgLeadTime = leadTimeResult.rows[0]?.avg_lead_sec || 0;

      const mttrResult = await pool.query(
        `WITH ordered AS (
           SELECT created_at, status, pipeline_status,
                  LAG(created_at) OVER (ORDER BY created_at) as prev_created,
                  LAG(status) OVER (ORDER BY created_at) as prev_status
           FROM project_deployments
           WHERE project_id = ANY($1) AND created_at >= $2
         )
         SELECT AVG(EXTRACT(EPOCH FROM (created_at - prev_created)) / 60)::int as avg_mttr_min
         FROM ordered
         WHERE prev_status = 'failed' AND status = 'success'
           AND EXTRACT(EPOCH FROM (created_at - prev_created)) / 60 BETWEEN 0 AND 1440`,
        [projectIds, dateFrom]
      );
      const avgMttr = mttrResult.rows[0]?.avg_mttr_min || 0;

      const commitsResult = await pool.query(
        `SELECT
           COUNT(*)::int as total,
           COUNT(DISTINCT author_email)::int as contributors,
           COUNT(DISTINCT TO_CHAR(committed_date, 'YYYY-MM-DD'))::int as active_days
         FROM commits
         WHERE project_id = ANY($1) AND committed_date >= $2`,
        [projectIds, dateFrom]
      );
      const commitsPerDay = Math.round((commitsResult.rows[0].total / deployDays) * 100) / 100;

      const pipelineResult = await pool.query(
        `SELECT
           COUNT(*)::int as total,
           COUNT(*) FILTER (WHERE status = 'success')::int as success
         FROM project_pipelines
         WHERE project_id = ANY($1) AND created_at >= $2`,
        [projectIds, dateFrom]
      );
      const pipelineSuccessRate = pipelineResult.rows[0].total > 0
        ? Math.round((pipelineResult.rows[0].success / pipelineResult.rows[0].total) * 100) : 0;

      const mrResult = await pool.query(
        `SELECT
           COUNT(*)::int as total,
           COUNT(*) FILTER (WHERE state = 'merged')::int as merged,
           COUNT(*) FILTER (WHERE state = 'opened')::int as opened
         FROM project_merge_requests
         WHERE project_id = ANY($1) AND created_at >= $2`,
        [projectIds, dateFrom]
      );
      const mergeRate = mrResult.rows[0].total > 0
        ? Math.round((mrResult.rows[0].merged / mrResult.rows[0].total) * 100) : 0;

      const branchResult = await pool.query(
        `SELECT
           COUNT(*)::int as total,
           COUNT(*) FILTER (WHERE merged) as merged,
           COUNT(*) FILTER (WHERE NOT merged AND last_commit_date >= $2) as active,
           COUNT(*) FILTER (WHERE NOT merged AND (last_commit_date < $2 OR last_commit_date IS NULL)) as stale
         FROM project_branches
         WHERE project_id = ANY($1)`,
        [projectIds, date90]
      );
      const br = branchResult.rows[0];
      const nonMerged = (br.total - br.merged) || 1;
      const branchHealth = Math.round((br.active / nonMerged) * 100);

      const topContribResult = await pool.query(
        `SELECT author_email, MAX(author_name) as name, COUNT(*)::int as commits, SUM(additions + deletions)::int as changes
         FROM commits
         WHERE project_id = ANY($1) AND committed_date >= $2
         GROUP BY author_email ORDER BY changes DESC LIMIT 3`,
        [projectIds, dateFrom]
      );

      groups.push({
        tag,
        projectCount: projectIds.length,
        dora: {
          deployFrequency: deployFreq,
          avgLeadTimeSec: avgLeadTime,
          failureRate: doraFailRate,
          avgMttrMin: avgMttr,
          total: dora.total,
        },
        commits: {
          total: commitsResult.rows[0].total,
          perDay: commitsPerDay,
          contributors: commitsResult.rows[0].contributors,
          activeDays: commitsResult.rows[0].active_days,
        },
        pipelines: {
          total: pipelineResult.rows[0].total,
          successRate: pipelineSuccessRate,
        },
        mr: {
          total: mrResult.rows[0].total,
          merged: mrResult.rows[0].merged,
          opened: mrResult.rows[0].opened,
          mergeRate,
        },
        branches: {
          total: br.total,
          active: br.active,
          stale: br.stale,
          merged: br.merged,
          health: branchHealth,
        },
        topContributors: topContribResult.rows.map((r: any) => ({
          email: r.author_email,
          name: r.name,
          commits: r.commits,
          changes: r.changes,
        })),
      });
    }

    return {
      ok: true,
      data: {
        groups,
        availableTags: allTags.rows.map((r: any) => r.tag),
        dateRange: { from: dateFrom, to: dateTo },
      },
    };
  });

  app.get<{
    Querystring: { contributors?: string; project_ids?: string; date_from?: string; date_to?: string };
  }>("/api/v1/benchmark/contributors", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    if (user.role !== "admin" && user.role !== "manager") {
      return reply.status(403).send({ ok: false, error: "Access denied: admin or manager role required" });
    }

    const { contributors, project_ids, date_from, date_to } = request.query;
    if (!contributors) {
      return { ok: true, data: { groups: [] } };
    }

    const pool = getPool();
    const emails = contributors.split(",").filter(Boolean);
    const projIds = project_ids ? project_ids.split(",").map(Number).filter(Boolean) : null;
    const dateFrom = date_from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dateTo = date_to || new Date().toISOString().slice(0, 10);
    const deployDays = Math.max(1, Math.ceil((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1);

    const groups: any[] = [];

    for (const email of emails) {
      const nameResult = await pool.query(
        "SELECT display_name, emails FROM contributor_directory WHERE emails @> ARRAY[$1]::text[]",
        [email]
      );
      let allEmails = [email];
      let displayName = email;
      if (nameResult.rows.length > 0) {
        allEmails = nameResult.rows[0].emails;
        displayName = nameResult.rows[0].display_name;
      } else {
        const nameR = await pool.query("SELECT author_name FROM contributor_profiles WHERE author_email = $1 LIMIT 1", [email]);
        if (nameR.rows[0]?.author_name) displayName = nameR.rows[0].author_name;
      }

      const projCond = projIds && projIds.length > 0 ? "AND project_id = ANY($3)" : "";
      const projParams = projIds && projIds.length > 0 ? [allEmails, dateFrom, projIds] : [allEmails, dateFrom];

      const commitsResult = await pool.query(
        `SELECT COUNT(*)::int as total, COALESCE(SUM(additions + deletions), 0)::int as changes,
                COUNT(DISTINCT TO_CHAR(committed_date, 'YYYY-MM-DD'))::int as active_days
         FROM commits WHERE author_email = ANY($1) AND committed_date >= $2 ${projCond}`,
        projParams
      );
      const commitsPerDay = Math.round((commitsResult.rows[0].total / deployDays) * 100) / 100;

      const mrResult = await pool.query(
        `SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE state = 'merged')::int as merged
         FROM project_merge_requests WHERE author_email = ANY($1) AND created_at >= $2 ${projCond}`,
        projParams
      );
      const mergeRate = mrResult.rows[0].total > 0
        ? Math.round((mrResult.rows[0].merged / mrResult.rows[0].total) * 100) : 0;

      // Compute score components
      const freqResult = await pool.query(
        `SELECT frequency FROM contributor_profiles WHERE author_email = ANY($1)`,
        [allEmails]
      );
      const mergedFreq: Record<string, number> = {};
      for (const fr of freqResult.rows) {
        for (const [k, v] of Object.entries(fr.frequency || {})) {
          mergedFreq[k] = (mergedFreq[k] || 0) + Number(v);
        }
      }
      const freqDates = Object.keys(mergedFreq).sort();
      const activeDays = freqDates.filter((d) => mergedFreq[d] > 0).length;
      const totalCommits = commitsResult.rows[0].total || 1;
      const avgChangesPerCommit = totalCommits > 0 ? (commitsResult.rows[0].changes || 0) / totalCommits : 0;
      const commitsPerWeek = activeDays > 0 ? totalCommits / (activeDays / 7) : 0;

      // Activity span = business days in freq range
      let activitySpan = 0;
      if (freqDates.length >= 2) {
        const first = new Date(freqDates[0]);
        const last = new Date(freqDates[freqDates.length - 1]);
        let count = 0;
        const d = new Date(first);
        while (d <= last) { const dow = d.getDay(); if (dow !== 0 && dow !== 6) count++; d.setDate(d.getDate() + 1); }
        activitySpan = count;
      } else if (freqDates.length === 1) {
        const dow = new Date(freqDates[0]).getDay();
        activitySpan = (dow !== 0 && dow !== 6) ? 1 : 0;
      }
      const consistency = activitySpan > 0 ? Math.min(activeDays / activitySpan, 1) : 0;
      const activity = Math.min(commitsPerWeek / 15, 1);
      const changesPerDay = activeDays > 0 ? (commitsResult.rows[0].changes || 0) / activeDays : 0;
      const impact = Math.min(changesPerDay / 200, 1);
      const sizeQuality = avgChangesPerCommit <= 10 ? 0.3 : avgChangesPerCommit <= 50 ? 1 : avgChangesPerCommit <= 200 ? 0.8 : avgChangesPerCommit <= 500 ? 0.5 : 0.2;

      // Deploy reliability
      const deployResult = await pool.query(
        `WITH mr_data AS (
           SELECT mr.project_id, mr.source_branch, mr.gitlab_iid, mr.state
           FROM project_merge_requests mr WHERE mr.author_email = ANY($1) AND mr.created_at >= $2
         )
         SELECT COUNT(DISTINCT md.gitlab_iid) FILTER (WHERE md.state = 'merged') as merged_mrs,
                COUNT(DISTINCT p.gitlab_id) as total_pipelines,
                COUNT(DISTINCT p.gitlab_id) FILTER (WHERE p.status = 'success') as success_pipelines,
                COUNT(DISTINCT p.gitlab_id) FILTER (WHERE p.status IN ('success','failed')) as completed_pipelines
         FROM mr_data md
         LEFT JOIN project_pipelines p ON p.project_id = md.project_id AND p.ref = md.source_branch`,
        projParams
      );
      const dr = deployResult.rows[0];
      const deploySuccessRate = dr.completed_pipelines > 0 ? Math.round((dr.success_pipelines / dr.completed_pipelines) * 100) : 0;
      const pipelineCoverage = dr.merged_mrs > 0 ? Math.round((Number(dr.completed_pipelines) > 0 ? 1 : 0) * 100) : 0;

      const raw = (consistency * 25) + (activity * 20) + (impact * 20) + (sizeQuality * 15) + (0.5 * 20);
      const score = Math.round(Math.min(100, Math.max(0, raw)));

      groups.push({
        tag: displayName,
        email,
        projectCount: 0,
        dora: { deployFrequency: 0, avgLeadTimeSec: 0, failureRate: 0, avgMttrMin: 0, total: 0 },
        commits: {
          total: commitsResult.rows[0].total,
          perDay: commitsPerDay,
          contributors: 1,
          activeDays: commitsResult.rows[0].active_days,
          changes: commitsResult.rows[0].changes,
        },
        pipelines: { total: 0, successRate: 0 },
        mr: {
          total: mrResult.rows[0].total,
          merged: mrResult.rows[0].merged,
          opened: 0,
          mergeRate,
        },
        branches: { total: 0, active: 0, stale: 0, merged: 0, health: 0 },
        score: {
          total: score,
          consistency: Math.round(consistency * 100),
          activity: Math.round(activity * 100),
          impact: Math.round(impact * 100),
          sizeQuality: Math.round(sizeQuality * 100),
          deploySuccessRate,
          pipelineCoverage,
          totalMergedMrs: Number(dr.merged_mrs),
          totalPipelines: Number(dr.total_pipelines),
          successPipelines: Number(dr.success_pipelines),
        },
        topContributors: [],
      });
    }

    return { ok: true, data: { groups } };
  });
}
