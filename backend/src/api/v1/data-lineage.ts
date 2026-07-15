import type { FastifyInstance } from "fastify";
import { requireAuth, type JwtPayload } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";

const lineageData: {
  collectors: Record<string, any>;
  tables: Record<string, any>;
  api_endpoints: Record<string, any>;
} = {
  collectors: {
    "contributor-collector": { writes_to: ["commits", "contributor_profiles"], description: "Сбор коммитов и профилей контрибьюторов" },
    "branch-collector": { writes_to: ["project_branches", "commits", "contributor_profiles"], description: "Сбор веток и их метаданных" },
    "mr-collector": { writes_to: ["project_merge_requests"], description: "Сбор merge request'ов и одобрений" },
    "issue-collector": { writes_to: ["project_issues"], description: "Сбор задач (issues)" },
    "pipeline-collector": { writes_to: ["project_pipelines", "project_deployments"], description: "Сбор пайплайнов и деплоев CI/CD" },
    "stack-collector": { writes_to: ["project_languages"], description: "Сбор информации о языках программирования" },
    "activity-collector": { writes_to: ["project_activity"], description: "Сбор дневной активности" },
    "dependency-audit": { writes_to: ["project_dependencies_audit"], description: "Аудит зависимостей и проверка актуальности версий" },
  },
  tables: {
    commits: { written_by: ["contributor-collector", "branch-collector"], read_by: ["dashboard", "contributor-analytics", "executive-report"], description: "Уникальные коммиты с метаданными автора" },
    contributor_profiles: { written_by: ["contributor-collector", "branch-collector"], read_by: ["contributor-analytics", "benchmark"], description: "Агрегированная статистика контрибьюторов" },
    project_branches: { written_by: ["branch-collector"], read_by: ["dashboard", "branches", "benchmark"], description: "Метаданные веток" },
    project_merge_requests: { written_by: ["mr-collector"], read_by: ["dashboard", "mr-analytics", "benchmark"], description: "Merge request'ы с авторами и одобрениями" },
    project_issues: { written_by: ["issue-collector"], read_by: ["issues"], description: "Задачи с состояниями" },
    project_pipelines: { written_by: ["pipeline-collector"], read_by: ["dashboard", "pipelines", "dora-metrics"], description: "Пайплайны CI/CD" },
    project_deployments: { written_by: ["pipeline-collector"], read_by: ["dashboard", "dora-metrics", "executive-report"], description: "Деплои" },
    project_languages: { written_by: ["stack-collector"], read_by: ["stack"], description: "Языки программирования" },
    project_activity: { written_by: ["activity-collector"], read_by: ["activity", "dashboard"], description: "Дневная активность" },
    project_dependencies_audit: { written_by: ["dependency-audit"], read_by: ["dependencies"], description: "Аудит зависимостей" },
  },
  api_endpoints: {
    "/api/v1/dashboard": { reads_from: ["commits", "project_branches", "project_merge_requests", "contributor_directory", "project_deployments"], description: "Главная панель обзора" },
    "/api/v1/contributor-analytics": { reads_from: ["contributor_profiles", "contributor_directory", "commits"], description: "Аналитика контрибьюторов" },
    "/api/v1/mr-analytics": { reads_from: ["project_merge_requests", "contributor_directory"], description: "Аналитика merge request'ов" },
    "/api/v1/pipelines": { reads_from: ["project_pipelines", "projects"], description: "Аналитика пайплайнов" },
    "/api/v1/dora-metrics": { reads_from: ["project_deployments"], description: "DORA-метрики" },
    "/api/v1/benchmark": { reads_from: ["commits", "project_pipelines", "project_merge_requests", "project_branches"], description: "Бенчмарк по тегам" },
    "/api/v1/branches": { reads_from: ["project_branches", "projects"], description: "Список веток" },
    "/api/v1/stack/languages": { reads_from: ["project_languages", "projects"], description: "Аналитика языков" },
    "/api/v1/activity": { reads_from: ["project_activity", "commits"], description: "Дневная активность" },
    "/api/v1/executive-report": { reads_from: ["все таблицы"], description: "Исполнительный отчёт" },
  },
};

export async function dataLineageRoutes(app: FastifyInstance) {
  app.get("/api/v1/data-lineage/flow", { preHandler: [requireAuth] }, async (request) => {
    const user = (request as any).user as JwtPayload;
    if (user.role !== "admin") {
      return { ok: true, data: lineageData };
    }
    return { ok: true, data: lineageData };
  });

  app.get<{
    Querystring: { name?: string };
  }>("/api/v1/data-lineage/table/:name", { preHandler: [requireAuth] }, async (request, reply) => {
    const { name } = request.params as { name: string };
    const tableInfo = lineageData.tables[name as keyof typeof lineageData.tables];
    if (!tableInfo) {
      return reply.status(404).send({ ok: false, error: `Table '${name}' not found in lineage` });
    }

    const pool = getPool();
    let rowCount = 0;
    let tableSize = "0 bytes";
    let lastUpdated = null;

    try {
      const statsResult = await pool.query(
        `SELECT n_live_tup, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
         FROM pg_stat_user_tables WHERE tablename = $1`,
        [name]
      );
      if (statsResult.rows.length > 0) {
        rowCount = statsResult.rows[0].n_live_tup;
        tableSize = statsResult.rows[0].size;
      }

      if (name === "commits") {
        const lr = await pool.query(`SELECT MAX(committed_date) as last FROM commits`);
        lastUpdated = lr.rows[0]?.last;
      } else if (name.startsWith("project_")) {
        const lr = await pool.query(`SELECT MAX(created_at) as last FROM ${name}`);
        lastUpdated = lr.rows[0]?.last;
      }
    } catch {}

    return {
      ok: true,
      data: {
        name,
        ...tableInfo,
        stats: { rowCount, size: tableSize, lastUpdated },
      },
    };
  });

  app.get("/api/v1/data-lineage/stats", { preHandler: [requireAuth] }, async () => {
    const pool = getPool();
    const tables = Object.keys(lineageData.tables);

    const statsResult = await pool.query(
      `SELECT tablename, n_live_tup,
              pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
       FROM pg_stat_user_tables
       WHERE tablename = ANY($1)
       ORDER BY n_live_tup DESC`,
      [tables]
    );

    const stats: Record<string, { rowCount: number; size: string }> = {};
    for (const row of statsResult.rows) {
      stats[row.tablename] = { rowCount: row.n_live_tup, size: row.size };
    }

    return {
      ok: true,
      data: {
        collectors: lineageData.collectors,
        tables: Object.entries(lineageData.tables).map(([name, info]) => ({
          name,
          ...info,
          stats: stats[name] || { rowCount: 0, size: "0 bytes" },
        })),
        totalCollectors: Object.keys(lineageData.collectors).length,
        totalTables: tables.length,
      },
    };
  });
}
