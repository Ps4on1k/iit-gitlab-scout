import type { FastifyInstance } from "fastify";
import { requireAuth, type JwtPayload } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";

export async function dataCollectionRoutes(app: FastifyInstance) {
  app.get("/api/v1/data-collection/jobs", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    if (user.role !== "admin") {
      return reply.status(403).send({ ok: false, error: "Admin role required" });
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT se.*, p.label as project_label
       FROM scheduler_errors se
       LEFT JOIN projects p ON p.id = se.project_id
       ORDER BY se.created_at DESC
       LIMIT 100`
    );

    const settingsResult = await pool.query(
      "SELECT * FROM scheduler_settings ORDER BY task_name"
    );

    return {
      ok: true,
      data: {
        recentErrors: result.rows,
        tasks: settingsResult.rows,
      },
    };
  });

  app.get("/api/v1/data-collection/stats", { preHandler: [requireAuth] }, async () => {
    const pool = getPool();

    const projectCount = await pool.query("SELECT COUNT(*)::int as count FROM projects");
    const commitCount = await pool.query("SELECT COUNT(*)::int as count FROM commits");
    const mrCount = await pool.query("SELECT COUNT(*)::int as count FROM project_merge_requests");
    const pipelineCount = await pool.query("SELECT COUNT(*)::int as count FROM project_pipelines");
    const branchCount = await pool.query("SELECT COUNT(*)::int as count FROM project_branches");
    const issueCount = await pool.query("SELECT COUNT(*)::int as count FROM project_issues");
    const deploymentCount = await pool.query("SELECT COUNT(*)::int as count FROM project_deployments");
    const depCount = await pool.query("SELECT COUNT(*)::int as count FROM project_dependencies_audit");
    const langCount = await pool.query("SELECT COUNT(*)::int as count FROM project_languages");
    const activityCount = await pool.query("SELECT COUNT(*)::int as count FROM project_activity");

    const lastCommit = await pool.query("SELECT MAX(committed_date) as last FROM commits");
    const lastMr = await pool.query("SELECT MAX(created_at) as last FROM project_merge_requests");
    const lastPipeline = await pool.query("SELECT MAX(created_at) as last FROM project_pipelines");
    const lastError = await pool.query("SELECT MAX(created_at) as last FROM scheduler_errors");

    const errorCount24h = await pool.query(
      `SELECT COUNT(*)::int as count FROM scheduler_errors WHERE created_at > now() - interval '24 hours'`
    );

    const taskStats = await pool.query(
      `SELECT task_name, last_run_at, enabled FROM scheduler_settings ORDER BY task_name`
    );

    return {
      ok: true,
      data: {
        projects: projectCount.rows[0].count,
        records: {
          commits: commitCount.rows[0].count,
          mergeRequests: mrCount.rows[0].count,
          pipelines: pipelineCount.rows[0].count,
          branches: branchCount.rows[0].count,
          issues: issueCount.rows[0].count,
          deployments: deploymentCount.rows[0].count,
          dependencies: depCount.rows[0].count,
          languages: langCount.rows[0].count,
          activity: activityCount.rows[0].count,
        },
        freshness: {
          lastCommit: lastCommit.rows[0].last,
          lastMr: lastMr.rows[0].last,
          lastPipeline: lastPipeline.rows[0].last,
          lastError: lastError.rows[0].last,
        },
        errors24h: errorCount24h.rows[0].count,
        tasks: taskStats.rows,
      },
    };
  });

  app.get("/api/v1/data-collection/health", { preHandler: [requireAuth] }, async () => {
    const pool = getPool();

    const warnings: { table: string; message: string; severity: "info" | "warning" | "error" }[] = [];

    const tablesToCheck = [
      { name: "commits", dateColumn: "committed_date" },
      { name: "project_merge_requests", dateColumn: "created_at" },
      { name: "project_pipelines", dateColumn: "created_at" },
      { name: "project_deployments", dateColumn: "created_at" },
    ];

    for (const table of tablesToCheck) {
      try {
        const result = await pool.query(
          `SELECT MAX(${table.dateColumn}) as last_update FROM ${table.name}`
        );
        const lastUpdate = result.rows[0]?.last_update;
        if (!lastUpdate) {
          warnings.push({ table: table.name, message: "Нет данных", severity: "warning" });
          continue;
        }
        const daysSince = Math.floor((Date.now() - new Date(lastUpdate).getTime()) / 86400000);
        if (daysSince > 7) {
          warnings.push({ table: table.name, message: `Данные устарели на ${daysSince} дн.`, severity: "warning" });
        }
        if (daysSince > 30) {
          warnings.push({ table: table.name, message: `Критично: данные устарели на ${daysSince} дн.`, severity: "error" });
        }
      } catch {
        warnings.push({ table: table.name, message: "Ошибка чтения", severity: "error" });
      }
    }

    const errorCount = await pool.query(
      `SELECT COUNT(*)::int as count FROM scheduler_errors WHERE created_at > now() - interval '24 hours'`
    );
    if (errorCount.rows[0].count > 0) {
      warnings.push({ table: "scheduler_errors", message: `${errorCount.rows[0].count} ошибок за 24ч`, severity: "warning" });
    }

    const overallHealth = warnings.some((w) => w.severity === "error")
      ? "critical"
      : warnings.some((w) => w.severity === "warning")
      ? "degraded"
      : "healthy";

    return {
      ok: true,
      data: { health: overallHealth, warnings },
    };
  });
}
