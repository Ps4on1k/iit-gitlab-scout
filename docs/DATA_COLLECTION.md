# Сбор данных

## Архитектура

```
GitLab API v4 (Rate Limited, 1 req/sec + jitter)
    ↓
Dagster (14 ассетов, 2 расписания)
    ↓
PostgreSQL (сырые таблицы + 6 staging views + 6 materialized views)
    ↓
Backend API (Fastify, RBAC фильтрация, кэширование 60s)
    ↓
Frontend (React + Ant Design, кэширование 5min)
```

## Расписания Dagster

| Расписание | Cron | Что собирает |
|------------|------|-------------|
| `core_collection` | `0 */6 * * *` | Commits, MR, Pipelines, Branches, Issues, Deployments, Contributors, Activity + dbt |
| `weekly_audit` | `0 2 * * 0` | Dependencies (сбор + audit), Languages, ClickHouse sync + dbt |

## Ассеты Dagster

### Основной сбор (core_collection)

| Ассет | Таблица | GitLab API | Ключевые особенности |
|-------|---------|------------|---------------------|
| `gitlab_commits` | commits | `/repository/commits?with_stats=true` | Инкрементальный (`since`), upsert, stats (additions/deletions) |
| `gitlab_merge_requests` | project_merge_requests | `/merge_requests` + `/approvals` | Инкрементальный (`updated_after`), per-MR approvals для reviewers |
| `gitlab_pipelines` | project_pipelines | `/pipelines` | Инкрементальный, duration backfill (LEAD window + ref avg) |
| `gitlab_branches` | project_branches | `/repository/branches?with_stats=true` | Полный сбор, commit stats из `commit` объекта |
| `gitlab_issues` | project_issues | `/issues?state=all` | Полный сбор (DELETE + INSERT) |
| `gitlab_deployments` | project_deployments | `/deployments` | Инкрементальный, **raw_json** для DORA lead time |
| `gitlab_contributors` | contributor_profiles | SQL агрегация из commits | Frequency JSONB, upsert |
| `gitlab_activity` | project_activity | SQL агрегация из commits/MR/pipelines | FULL OUTER JOIN, EXISTS filter |

### Еженедельный сбор (weekly_audit)

| Ассет | Таблица | Описание |
|-------|---------|----------|
| `gitlab_dependencies` | project_dependencies_audit | Сбор dependency файлов из repository tree (с исключением node_modules) |
| `gitlab_dependency_audit` | project_dependencies_audit | Проверка актуальности версий через npm/pypi/nuget/go/maven APIs |
| `gitlab_languages` | project_languages | Языки программирования (% по байтам) |
| `clickhouse_sync` | — | Инкрементальная синхронизация PG → CH (опционально) |

### Обработка данных

| Ассет | Описание |
|-------|----------|
| `dbt_staging` | 6 staging views (stg_commits, stg_merge_requests, ...) |
| `dbt_marts` | 6 materialized views + REFRESH MATERIALIZED VIEW |
| `lineage_update` | Обновление метаданных lineage |

### Зависимости ассетов

```
gitlab_commits ─────────────────────────────┐
gitlab_merge_requests (deps: commits) ──────┤
gitlab_pipelines (deps: commits) ───────────┤
gitlab_branches ────────────────────────────┤
gitlab_issues ──────────────────────────────┤
gitlab_deployments (deps: pipelines) ───────┤──▶ dbt_staging ──▶ dbt_marts ──▶ lineage_update
gitlab_languages ───────────────────────────┤
gitlab_contributors (deps: commits) ────────┤
gitlab_activity (deps: commits,MRs,pipes) ─┤
gitlab_dependencies ────────────────────────┤
gitlab_dependency_audit ────────────────────┤
clickhouse_sync ────────────────────────────┘
```

## Инкрементальный сбор

| Ассет | Механизм | SQL параметр |
|-------|----------|-------------|
| commits | `MAX(committed_date)` → `since` | `?since=<ISO_DATE>` |
| merge_requests | `MAX(updated_at)` → `updated_after` | `?updated_after=<ISO_DATE>` |
| pipelines | `MAX(created_at)` → `updated_after` | `?updated_after=<ISO_DATE>` |
| deployments | `MAX(created_at)` → `updated_after` | `?updated_after=<ISO_DATE>` |
| branches | полный сбор | — |
| languages | DELETE + INSERT | — |
| dependencies | DELETE + INSERT | — |
| dependency_audit | DELETE + INSERT | — |

## Rate Limiting

| Компонент | Механизм | Лимит |
|-----------|----------|-------|
| Dagster `_throttle()` | Token bucket + jitter | 1 req/sec + random(0..1)s |
| Backend `gitlab-client.ts` | Token bucket | 2 RPS |
| GitLab API | Per-user | ~60 req/min |

При 429: retry с `Retry-After` header + exponential backoff (3 попытки).

## Dependency Audit

### Сбор зависимостей (`gitlab_dependencies`)
- Сканирует `repository/tree` рекурсивно
- Ищет файлы: package.json, requirements.txt, go.mod, Cargo.toml, pom.xml, build.gradle, composer.json, Podfile, pubspec.yaml, Package.swift
- **Исключает**: node_modules, .git, vendor, dist, build, __pycache__
- Использует `gitlab_request_raw` для чтения файлов (plain text, не JSON)

### Проверка актуальности (`gitlab_dependency_audit`)
- Читает `dependency_catalog` (80 записей: npm, pip, go, cargo, maven, nuget, ...)
- Проверяет最新 версию через публичные API:
  - npm: `registry.npmjs.org/{name}/latest`
  - pip: `pypi.org/pypi/{name}/json`
  - go: `proxy.golang.org/{name}/@latest`
  - nuget: `api.nuget.org/v3-flatcontainer/{name}/index.json`
  - maven: `search.maven.org/solrsearch/select?q=...`
- Сравнивает текущую версию с latest → `is_outdated` флаг
- Запускается раз в неделю (воскресенье 02:00 UTC)

## Materialized Views (dbt)

| Витрина | Назначение | Обновление |
|---------|-----------|------------|
| mart_dashboard | KPI по проектам (коммиты, MR, деплои, пайплайны) | REFRESH после dbt run |
| mart_dora | DORA-метрики (deploy frequency, failure rate, lead time, MTTR) | REFRESH после dbt run |
| mart_activity | Дневная активность | REFRESH после dbt run |
| mart_contributors | Статистика по авторам | REFRESH после dbt run |
| mart_benchmark | Сравнение по тегам | REFRESH после dbt run |
| mart_executive_report | Сводный отчёт | REFRESH после dbt run |

### RBAC
Все витрины содержат `project_id`. API фильтрует:
```sql
WHERE project_id = ANY($1)  -- $1 = getFilteredProjectIds(userId)
```

## Мониторинг

- **Dagster UI** (`http://localhost:3001`): история запусков, логи, расписание
- **Сбор данных** (вкладка): записи по таблицам, свежесть данных
- **Потоки данных** (lineage): визуальная карта pipeline

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| Нет новых данных | Запустить `scheduled_collection` в Dagster UI |
| Ошибки в Dagster | Открыть Logs → найти FAILED run |
| Витрины пустые | `docker compose --profile dagster exec dagster dbt run --select marts --full-refresh --profiles-dir /usr/app/dbt --project-dir /usr/app/dbt` |
| Dependencies = 0 | Проверить логи: `docker logs dagster 2>&1 \| grep dependency` |
| DORA lead time = 0 | Пересобрать deployments (должен содержать `raw_json`) |
| Reviewers пусто | Пересобрать MR (per-MR approvals fetch) |
| Pipeline duration NULL | Пересобрать pipelines + backfill |
| 429 Too Many Requests | Подождать или уменьшить `RATE_LIMIT_RPS` |
