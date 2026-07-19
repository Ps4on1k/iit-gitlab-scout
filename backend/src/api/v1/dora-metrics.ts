import type { FastifyInstance } from "fastify";
import { requireAuth, type JwtPayload } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import { getFilteredProjectIds } from "../../utils/project-filter.js";

export async function doraMetricsRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { project_ids?: string; environment?: string; date_from?: string; date_to?: string };
  }>("/api/v1/dora-metrics", { preHandler: [requireAuth] }, async (request) => {
    const { project_ids, environment, date_from, date_to } = request.query;
    const user = (request as any).user as JwtPayload;
    const pool = getPool();
    const allowedIds = await getFilteredProjectIds(user.userId);

    let projectIds: number[];
    if (project_ids) {
      const ids = project_ids.split(",").map(Number).filter(Boolean);
      projectIds = allowedIds !== null ? ids.filter((id) => allowedIds.includes(id)) : ids;
    } else if (allowedIds !== null) {
      projectIds = allowedIds;
    } else {
      const all = await pool.query("SELECT id FROM projects");
      projectIds = all.rows.map((r: any) => r.id);
    }

    if (projectIds.length === 0) {
      return { ok: true, data: emptyDora() };
    }

    const dateFrom = date_from || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const dateTo = date_to || new Date().toISOString().slice(0, 10);
    const env = environment || "__all__";

    const envCondition = env === "__all__"
      ? ""
      : `AND d.environment = $3`;

    const params: any[] = [projectIds, dateFrom];
    if (env !== "__all__") params.push(env);

    const deploysResult = await pool.query(
      `SELECT d.status, d.created_at, d.finished_at, d.environment, d.pipeline_status, d.raw_json,
              p.label as project_label, p.tags as project_tags
       FROM project_deployments d
       JOIN projects p ON p.id = d.project_id
       WHERE d.project_id = ANY($1)
         AND d.created_at >= $2
         ${envCondition}
       ORDER BY d.created_at`,
      params
    );

    const deploys = deploysResult.rows;
    const total = deploys.length;
    const success = deploys.filter((d: any) => d.status === "success").length;
    const failed = deploys.filter((d: any) => d.status === "failed" || d.pipeline_status === "failed").length;
    const canceled = deploys.filter((d: any) => d.status === "canceled").length;
    const other = total - success - failed - canceled;

    const failureRate = total > 0 ? Math.round((failed / total) * 10000) / 100 : 0;

    const leadTimes: number[] = [];
    for (const d of deploys) {
      if (d.status !== "success") continue;
      let commitDate: string | null = null;
      let deployDate: string | null = null;

      if (d.raw_json?.deployable?.commit?.committed_date) {
        commitDate = d.raw_json.deployable.commit.committed_date;
      } else if (d.raw_json?.deployable?.pipeline?.created_at) {
        commitDate = d.raw_json.deployable.pipeline.created_at;
      }

      if (d.raw_json?.created_at) {
        deployDate = d.raw_json.created_at;
      } else {
        deployDate = d.created_at;
      }

      if (commitDate && deployDate) {
        const lt = (new Date(deployDate).getTime() - new Date(commitDate).getTime()) / 1000;
        if (lt >= 0 && lt < 30 * 24 * 3600) leadTimes.push(lt);
      }
    }
    const avgLeadTime = leadTimes.length > 0 ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : 0;

    const dailyDeploys: Record<string, { total: number; success: number; failed: number }> = {};
    for (const d of deploys) {
      const day = new Date(d.created_at).toISOString().slice(0, 10);
      if (!dailyDeploys[day]) dailyDeploys[day] = { total: 0, success: 0, failed: 0 };
      dailyDeploys[day].total++;
      if (d.status === "success") dailyDeploys[day].success++;
      if (d.status === "failed" || d.pipeline_status === "failed") dailyDeploys[day].failed++;
    }
    const days = Object.keys(dailyDeploys).length || 1;
    const deployFrequency = Math.round((total / days) * 100) / 100;

    let mttrMinutes = 0;
    let failedStartedAt: Date | null = null;
    for (const d of deploys) {
      if (d.status === "failed" || d.pipeline_status === "failed") {
        failedStartedAt = new Date(d.created_at);
      } else if (d.status === "success" && failedStartedAt) {
        const restore = (new Date(d.created_at).getTime() - failedStartedAt.getTime()) / 60000;
        if (restore > 0 && restore < 24 * 60) mttrMinutes += restore;
        failedStartedAt = null;
      }
    }
    const mttrCount = deploys.filter((d: any) => d.status === "failed").length || 1;
    const avgMttr = Math.round(mttrMinutes / mttrCount) || 0;

    const trend = Object.entries(dailyDeploys).map(([date, v]) => ({
      date, ...v,
    }));

    const byProject: Record<string, { total: number; success: number; failed: number; label: string; tags: string[] }> = {};
    for (const d of deploys) {
      if (!byProject[d.project_label]) byProject[d.project_label] = { total: 0, success: 0, failed: 0, label: d.project_label, tags: d.project_tags || [] };
      byProject[d.project_label].total++;
      if (d.status === "success") byProject[d.project_label].success++;
      if (d.status === "failed" || d.pipeline_status === "failed") byProject[d.project_label].failed++;
    }
    const byProjectList = Object.values(byProject).sort((a, b) => b.total - a.total).slice(0, 10);

    const environments = await pool.query(
      `SELECT DISTINCT environment FROM project_deployments WHERE project_id = ANY($1) AND environment != '' ORDER BY environment`,
      [projectIds]
    );

    const dailyMetrics: Record<string, { deploys: number; success: number; failed: number; leadTimes: number[]; mttrMinutes: number[] }> = {};
    for (const d of deploys) {
      const day = new Date(d.created_at).toISOString().slice(0, 10);
      if (!dailyMetrics[day]) dailyMetrics[day] = { deploys: 0, success: 0, failed: 0, leadTimes: [], mttrMinutes: [] };
      dailyMetrics[day].deploys++;
      if (d.status === "success") dailyMetrics[day].success++;
      if (d.status === "failed" || d.pipeline_status === "failed") dailyMetrics[day].failed++;

      if (d.status === "success") {
        let commitDate: string | null = null;
        if (d.raw_json?.deployable?.commit?.committed_date) commitDate = d.raw_json.deployable.commit.committed_date;
        else if (d.raw_json?.deployable?.pipeline?.created_at) commitDate = d.raw_json.deployable.pipeline.created_at;
        if (commitDate) {
          const lt = (new Date(d.created_at).getTime() - new Date(commitDate).getTime()) / 1000;
          if (lt >= 0 && lt < 30 * 24 * 3600) dailyMetrics[day].leadTimes.push(lt);
        }
      }
    }

    const sortedDays = Object.keys(dailyMetrics).sort();

    const mttrByDay: Record<string, number[]> = {};
    let lastFailedAt: Date | null = null;
    for (const d of deploys) {
      if (d.status === "failed" || d.pipeline_status === "failed") {
        lastFailedAt = new Date(d.created_at);
      } else if (d.status === "success" && lastFailedAt) {
        const restoreMin = (new Date(d.created_at).getTime() - lastFailedAt.getTime()) / 60000;
        if (restoreMin > 0 && restoreMin < 24 * 60) {
          const day = new Date(d.created_at).toISOString().slice(0, 10);
          if (!mttrByDay[day]) mttrByDay[day] = [];
          mttrByDay[day].push(Math.round(restoreMin));
        }
        lastFailedAt = null;
      }
    }
    for (const [day, mins] of Object.entries(mttrByDay)) {
      if (dailyMetrics[day]) dailyMetrics[day].mttrMinutes = mins;
    }

    const dailyTrend = sortedDays.map((day) => {
      const dm = dailyMetrics[day];
      const avgLt = dm.leadTimes.length > 0 ? Math.round(dm.leadTimes.reduce((a, b) => a + b, 0) / dm.leadTimes.length) : null;
      const avgMttr = dm.mttrMinutes.length > 0 ? Math.round(dm.mttrMinutes.reduce((a, b) => a + b, 0) / dm.mttrMinutes.length) : null;
      const failRate = dm.deploys > 0 ? Math.round((dm.failed / dm.deploys) * 100) : null;
      return { date: day, deploys: dm.deploys, success: dm.success, failed: dm.failed, failureRate: failRate, avgLeadTimeSec: avgLt, avgMttrMin: avgMttr };
    });

    const weeklyMap: Record<string, { deploys: number; success: number; failed: number; leadTimes: number[]; mttrMinutes: number[] }> = {};
    for (const entry of dailyTrend) {
      const d = new Date(entry.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const wk = weekStart.toISOString().slice(0, 10);
      if (!weeklyMap[wk]) weeklyMap[wk] = { deploys: 0, success: 0, failed: 0, leadTimes: [], mttrMinutes: [] };
      weeklyMap[wk].deploys += entry.deploys;
      weeklyMap[wk].success += entry.success;
      weeklyMap[wk].failed += entry.failed;
    }
    const weeklyTrend = Object.entries(weeklyMap).sort(([a], [b]) => a.localeCompare(b)).map(([week, v]) => {
      const avgLt = v.leadTimes.length > 0 ? Math.round(v.leadTimes.reduce((a, b) => a + b, 0) / v.leadTimes.length) : null;
      const failRate = v.deploys > 0 ? Math.round((v.failed / v.deploys) * 100) : null;
      return { date: week, deploys: v.deploys, success: v.success, failed: v.failed, failureRate: failRate, avgLeadTimeSec: avgLt, avgMttrMin: null };
    });

    return {
      ok: true,
      data: {
        summary: {
          total,
          success,
          failed,
          canceled,
          other,
          failureRate,
          deployFrequency,
          avgLeadTimeSec: Math.round(avgLeadTime),
          avgMttrMin: avgMttr,
        },
        trend,
        dailyTrend,
        weeklyTrend,
        byProject: byProjectList,
        environments: environments.rows.map((r: any) => r.environment),
        dateRange: { from: dateFrom, to: dateTo },
      },
    };
  });
}

function emptyDora() {
  return {
    summary: { total: 0, success: 0, failed: 0, canceled: 0, other: 0, failureRate: 0, deployFrequency: 0, avgLeadTimeSec: 0, avgMttrMin: 0 },
    trend: [],
    byProject: [],
    environments: [],
    dateRange: { from: "", to: "" },
  };
}
