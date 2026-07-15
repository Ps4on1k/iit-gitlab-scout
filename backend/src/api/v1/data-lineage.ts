import type { FastifyInstance } from "fastify";
import { requireAuth, requireAdmin, type JwtPayload } from "../../utils/auth.js";
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
    commits: {
      written_by: ["contributor-collector", "branch-collector"],
      read_by: ["dashboard", "contributor-analytics", "executive-report"],
      description: "Уникальные коммиты с метаданными автора",
      fields: [
        { name: "id", type: "serial", description: "ID коммита" },
        { name: "project_id", type: "integer", description: "ID проекта GitLab" },
        { name: "sha", type: "text", description: "SHA-хэш коммита (UNIQUE per project)" },
        { name: "author_name", type: "text", description: "Имя автора" },
        { name: "author_email", type: "text", description: "Email автора" },
        { name: "message", type: "text", description: "Сообщение коммита" },
        { name: "committed_date", type: "timestamp", description: "Дата коммита" },
        { name: "additions", type: "integer", description: "Количество добавленных строк" },
        { name: "deletions", type: "integer", description: "Количество удалённых строк" },
      ],
    },
    contributor_profiles: {
      written_by: ["contributor-collector", "branch-collector"],
      read_by: ["contributor-analytics", "benchmark"],
      description: "Агрегированная статистика контрибьюторов по проектам",
      fields: [
        { name: "id", type: "serial", description: "ID профиля" },
        { name: "project_id", type: "integer", description: "ID проекта" },
        { name: "author_email", type: "text", description: "Email контрибьютора" },
        { name: "author_name", type: "text", description: "Имя контрибьютора" },
        { name: "total_commits", type: "integer", description: "Общее количество коммитов" },
        { name: "total_additions", type: "integer", description: "Общее количество добавленных строк" },
        { name: "total_deletions", type: "integer", description: "Общее количество удалённых строк" },
        { name: "frequency", type: "jsonb", description: "Частота коммитов по дням {дата: количество}" },
        { name: "first_commit_date", type: "date", description: "Дата первого коммита" },
        { name: "last_commit_date", type: "date", description: "Дата последнего коммита" },
      ],
    },
    project_branches: {
      written_by: ["branch-collector"],
      read_by: ["dashboard", "branches", "benchmark"],
      description: "Метаданные веток проектов",
      fields: [
        { name: "id", type: "serial", description: "ID записи" },
        { name: "project_id", type: "integer", description: "ID проекта" },
        { name: "name", type: "text", description: "Имя ветки (UNIQUE per project)" },
        { name: "merged", type: "boolean", description: "Замержена ли ветка" },
        { name: "protected", type: "boolean", description: "Защищена ли ветка" },
        { name: "default", type: "boolean", description: "Основная ветка проекта" },
        { name: "last_commit_date", type: "timestamp", description: "Дата последнего коммита в ветке" },
        { name: "last_commit_author", type: "text", description: "Автор последнего коммита" },
      ],
    },
    project_merge_requests: {
      written_by: ["mr-collector"],
      read_by: ["dashboard", "mr-analytics", "benchmark", "contributor-analytics"],
      description: "Merge request'ы с авторами, рецензентами и одобрениями",
      fields: [
        { name: "id", type: "serial", description: "ID записи" },
        { name: "project_id", type: "integer", description: "ID проекта" },
        { name: "gitlab_iid", type: "integer", description: "IID MR в GitLab (UNIQUE per project)" },
        { name: "title", type: "text", description: "Заголовок MR" },
        { name: "state", type: "text", description: "Состояние: opened, merged, closed" },
        { name: "author_name", type: "text", description: "Имя автора" },
        { name: "author_email", type: "text", description: "Email автора" },
        { name: "source_branch", type: "text", description: "Ветка-источник" },
        { name: "target_branch", type: "text", description: "Ветка назначения" },
        { name: "created_at", type: "timestamp", description: "Дата создания" },
        { name: "merged_at", type: "timestamp", description: "Дата слияния" },
        { name: "reviewers", type: "text[]", description: "Рецензенты" },
        { name: "approvals", type: "integer", description: "Количество одобрений" },
        { name: "changes_count", type: "integer", description: "Количество изменённых файлов" },
      ],
    },
    project_issues: {
      written_by: ["issue-collector"],
      read_by: ["issues"],
      description: "Задачи (issues) проектов",
      fields: [
        { name: "id", type: "serial", description: "ID записи" },
        { name: "project_id", type: "integer", description: "ID проекта" },
        { name: "gitlab_iid", type: "integer", description: "IID задачи в GitLab" },
        { name: "title", type: "text", description: "Заголовок задачи" },
        { name: "state", type: "text", description: "Состояние: opened, closed" },
        { name: "author_email", type: "text", description: "Email автора" },
        { name: "labels", type: "text", description: "Метки через запятую" },
        { name: "created_at", type: "timestamp", description: "Дата создания" },
        { name: "closed_at", type: "timestamp", description: "Дата закрытия" },
      ],
    },
    project_pipelines: {
      written_by: ["pipeline-collector"],
      read_by: ["dashboard", "pipelines", "dora-metrics", "contributor-analytics"],
      description: "Пайплайны CI/CD со статусами и длительностью",
      fields: [
        { name: "id", type: "serial", description: "ID записи" },
        { name: "project_id", type: "integer", description: "ID проекта" },
        { name: "gitlab_id", type: "integer", description: "ID пайплайна в GitLab (UNIQUE per project)" },
        { name: "status", type: "text", description: "Статус: success, failed, running, canceled" },
        { name: "ref", type: "text", description: "Ветка/тег запуска" },
        { name: "source", type: "text", description: "Источник: push, schedule, web и т.д." },
        { name: "duration", type: "integer", description: "Длительность в секундах" },
        { name: "created_at", type: "timestamp", description: "Дата создания" },
        { name: "finished_at", type: "timestamp", description: "Дата завершения" },
      ],
    },
    project_deployments: {
      written_by: ["pipeline-collector"],
      read_by: ["dashboard", "dora-metrics", "executive-report"],
      description: "Деплои с привязкой к пайплайнам и коммитам (DORA-метрики)",
      fields: [
        { name: "id", type: "serial", description: "ID записи" },
        { name: "project_id", type: "integer", description: "ID проекта" },
        { name: "gitlab_id", type: "integer", description: "ID деплоя в GitLab" },
        { name: "status", type: "text", description: "Статус: success, failed, canceled" },
        { name: "environment", type: "text", description: "Среда: production, staging и т.д." },
        { name: "pipeline_status", type: "text", description: "Статус связанного пайплайна" },
        { name: "created_at", type: "timestamp", description: "Дата создания" },
        { name: "raw_json", type: "jsonb", description: "Полный JSON ответа GitLab API" },
      ],
    },
    project_languages: {
      written_by: ["stack-collector"],
      read_by: ["stack"],
      description: "Распределение языков программирования по проектам",
      fields: [
        { name: "id", type: "serial", description: "ID записи" },
        { name: "project_id", type: "integer", description: "ID проекта" },
        { name: "language", type: "text", description: "Название языка" },
        { name: "bytes", type: "integer", description: "Количество байт кода" },
        { name: "percentage", type: "numeric", description: "Процент от общего объёма" },
      ],
    },
    project_activity: {
      written_by: ["activity-collector"],
      read_by: ["activity", "dashboard"],
      description: "Дневная агрегация активности: коммиты, MR, пайплайны",
      fields: [
        { name: "id", type: "serial", description: "ID записи" },
        { name: "project_id", type: "integer", description: "ID проекта" },
        { name: "date", type: "date", description: "Дата (UNIQUE per project)" },
        { name: "commits", type: "integer", description: "Количество коммитов за день" },
        { name: "merge_requests", type: "integer", description: "Количество MR за день" },
        { name: "pipelines", type: "integer", description: "Количество пайплайнов за день" },
      ],
    },
    project_dependencies_audit: {
      written_by: ["dependency-audit"],
      read_by: ["dependencies"],
      description: "Аудит зависимостей: имя, версия, актуальность",
      fields: [
        { name: "id", type: "serial", description: "ID записи" },
        { name: "project_id", type: "integer", description: "ID проекта" },
        { name: "name", type: "text", description: "Имя зависимости" },
        { name: "current_version", type: "text", description: "Текущая версия" },
        { name: "is_outdated", type: "boolean", description: "Устарела ли зависимость" },
        { name: "source", type: "text", description: "Экосистема: npm, pip, go, cargo и т.д." },
      ],
    },
    projects: {
      written_by: ["admin API"],
      read_by: ["все эндпоинты"],
      description: "Справочник проектов GitLab с токенами и тегами",
      fields: [
        { name: "id", type: "serial", description: "ID проекта" },
        { name: "path", type: "text", description: "Путь проекта в GitLab" },
        { name: "label", type: "text", description: "Отображаемое имя" },
        { name: "tags", type: "text[]", description: "Теги для группировки" },
        { name: "base_url", type: "text", description: "URL GitLab инстанса" },
        { name: "token_encrypted", type: "text", description: "Зашифрованный токен доступа" },
      ],
    },
    contributor_directory: {
      written_by: ["admin API"],
      read_by: ["все эндпоинты аналитики"],
      description: "Каноническое мapping имён → email'ов (консолидация контрибьюторов)",
      fields: [
        { name: "id", type: "serial", description: "ID записи" },
        { name: "display_name", type: "text", description: "Отображаемое имя (UNIQUE)" },
        { name: "emails", type: "text[]", description: "Связанные email-адреса" },
      ],
    },
    scheduler_errors: {
      written_by: ["scheduler"],
      read_by: ["scheduler API"],
      description: "Лог ошибок сбора данных",
      fields: [
        { name: "id", type: "serial", description: "ID записи" },
        { name: "task_name", type: "text", description: "Имя задачи сбора" },
        { name: "project_id", type: "integer", description: "ID проекта (nullable)" },
        { name: "error_code", type: "text", description: "Код ошибки" },
        { name: "error_message", type: "text", description: "Описание ошибки" },
        { name: "source", type: "text", description: "Источник: manual, scheduler" },
        { name: "created_at", type: "timestamp", description: "Время ошибки" },
      ],
    },
    dependency_catalog: {
      written_by: ["admin API"],
      read_by: ["dependency-audit"],
      description: "Каталог зависимостей: экосистемы, имена файлов, URL для проверки версий",
      category: "reference",
      fields: [
        { name: "id", type: "serial", description: "ID записи" },
        { name: "ecosystem", type: "text", description: "Экосистема: npm, pip, go, cargo и т.д." },
        { name: "language", type: "text", description: "Язык программирования" },
        { name: "framework", type: "text", description: "Фреймворк (nullable)" },
        { name: "file_names", type: "text[]", description: "Имена файлов зависимости (package.json, requirements.txt и т.д.)" },
        { name: "dependency_field", type: "text", description: "Поле в файле зависимости" },
        { name: "version_check_url", type: "text", description: "URL шаблон для проверки актуальной версии" },
        { name: "is_active", type: "boolean", description: "Активна ли запись" },
      ],
    },
    // dbt materialized views (created by dbt run)
    mart_dashboard: {
      written_by: ["dbt"],
      read_by: ["dashboard API"],
      description: "Материализованное представление для дашборда (агрегированные KPI)",
      fields: [
        { name: "total_projects", type: "integer", description: "Общее количество проектов" },
        { name: "active_projects", type: "integer", description: "Активные проекты (с коммитами за 90 дн.)" },
        { name: "total_contributors", type: "integer", description: "Уникальные контрибьюторы" },
        { name: "total_commits", type: "integer", description: "Общее количество коммитов" },
        { name: "active_days", type: "integer", description: "Дни с активностью" },
        { name: "total_branches", type: "integer", description: "Всего веток" },
        { name: "active_branches", type: "integer", description: "Активные ветки" },
        { name: "stale_branches", type: "integer", description: "Заброшенные ветки" },
        { name: "mr_total", type: "integer", description: "Всего MR" },
        { name: "mr_merged", type: "integer", description: "Слито MR" },
        { name: "deploy_total", type: "integer", description: "Всего деплоев" },
        { name: "deploy_success", type: "integer", description: "Успешные деплои" },
        { name: "deploy_failed", type: "integer", description: "Неудачные деплои" },
      ],
    },
    mart_dora: {
      written_by: ["dbt"],
      read_by: ["dora-metrics API"],
      description: "Материализованное представление для DORA-метрик",
      fields: [
        { name: "total", type: "integer", description: "Всего деплоев" },
        { name: "success", type: "integer", description: "Успешные деплои" },
        { name: "failed", type: "integer", description: "Неудачные деплои" },
        { name: "failure_rate", type: "numeric", description: "Доля ошибок (%)" },
        { name: "deploy_frequency", type: "numeric", description: "Частота деплоев (в день)" },
        { name: "avg_lead_time_sec", type: "integer", description: "Среднее время доставки (сек)" },
        { name: "avg_mttr_min", type: "integer", description: "Среднее время восстановления (мин)" },
      ],
    },
    mart_contributors: {
      written_by: ["dbt"],
      read_by: ["contributor-analytics API"],
      description: "Материализованное представление для аналитики контрибьюторов",
      fields: [
        { name: "author_email", type: "text", description: "Email контрибьютора" },
        { name: "author_name", type: "text", description: "Имя контрибьютора" },
        { name: "total_commits", type: "integer", description: "Общее количество коммитов" },
        { name: "total_changes", type: "integer", description: "Общее количество изменений" },
        { name: "active_days", type: "integer", description: "Активные дни" },
        { name: "commits_per_day", type: "numeric", description: "Коммитов в день (среднее)" },
        { name: "changes_per_day", type: "numeric", description: "Изменений в день (среднее)" },
      ],
    },
    mart_activity: {
      written_by: ["dbt"],
      read_by: ["activity API"],
      description: "Материализованное представление для дневной активности",
      fields: [
        { name: "day", type: "date", description: "Дата" },
        { name: "commits", type: "integer", description: "Коммитов за день" },
        { name: "merge_requests", type: "integer", description: "MR за день" },
        { name: "pipelines", type: "integer", description: "Пайплайнов за день" },
      ],
    },
    mart_benchmark: {
      written_by: ["dbt"],
      read_by: ["benchmark API"],
      description: "Материализованное представление для бенчмарка по тегам",
      fields: [
        { name: "tag", type: "text", description: "Тег проекта" },
        { name: "project_count", type: "integer", description: "Количество проектов" },
        { name: "total_commits", type: "integer", description: "Коммитов" },
        { name: "contributors", type: "integer", description: "Контрибьюторов" },
        { name: "total_deploys", type: "integer", description: "Деплоев" },
        { name: "failure_rate", type: "numeric", description: "Доля ошибок (%)" },
        { name: "pipeline_success_rate", type: "integer", description: "Успешность пайплайнов (%)" },
        { name: "merge_rate", type: "integer", description: "Доля слитых MR (%)" },
      ],
    },
    mart_executive_report: {
      written_by: ["dbt"],
      read_by: ["executive-report API"],
      description: "Материализованное представление для исполнительного отчёта",
      fields: [
        { name: "total_projects", type: "integer", description: "Всего проектов" },
        { name: "active_projects", type: "integer", description: "Активных проектов" },
        { name: "total_contributors", type: "integer", description: "Контрибьюторов" },
        { name: "total_commits", type: "integer", description: "Коммитов" },
        { name: "failure_rate", type: "numeric", description: "Доля ошибок деплоев (%)" },
        { name: "deploy_frequency", type: "numeric", description: "Частота деплоев (в день)" },
        { name: "avg_lead_time_sec", type: "integer", description: "Среднее время доставки (сек)" },
        { name: "avg_mttr_min", type: "integer", description: "Среднее время восстановления (мин)" },
      ],
    },
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

  // CRUD for dynamic lineage metadata (used by dbt/Dagster)
  app.post<{
    Body: { entity_type: string; entity_name: string; metadata: any };
  }>("/api/v1/data-lineage/metadata", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { entity_type, entity_name, metadata } = request.body;
    if (!entity_type || !entity_name) {
      return reply.status(400).send({ ok: false, error: "entity_type and entity_name are required" });
    }
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO lineage_metadata (entity_type, entity_name, metadata)
       VALUES ($1, $2, $3)
       ON CONFLICT (entity_type, entity_name)
       DO UPDATE SET metadata = $3, updated_at = now()
       RETURNING *`,
      [entity_type, entity_name, JSON.stringify(metadata || {})]
    );
    return { ok: true, data: result.rows[0] };
  });

  app.get("/api/v1/data-lineage/metadata", { preHandler: [requireAdmin] }, async () => {
    const pool = getPool();
    const result = await pool.query("SELECT * FROM lineage_metadata ORDER BY entity_type, entity_name");
    return { ok: true, data: result.rows };
  });

  app.delete<{
    Params: { type: string; name: string };
  }>("/api/v1/data-lineage/metadata/:type/:name", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { type, name } = request.params as { type: string; name: string };
    const pool = getPool();
    const result = await pool.query(
      "DELETE FROM lineage_metadata WHERE entity_type = $1 AND entity_name = $2 RETURNING id",
      [type, name]
    );
    if (result.rows.length === 0) {
      return reply.status(404).send({ ok: false, error: "Not found" });
    }
    return { ok: true, data: { deleted: true } };
  });
}
