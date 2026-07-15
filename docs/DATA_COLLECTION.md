# Сбор данных

## Архитектура

```
GitLab API v4
    ↓ (rate limited, 2 RPS)
Dagster (11 ассетов)
    ↓
PostgreSQL (сырые таблицы)
    ↓
dbt (6 staging views → 6 materialized views)
    ↓
Backend API (Fastify, RBAC фильтрация)
    ↓
Frontend (React + Ant Design)
```

## Ассеты Dagster

### Коллекторы данных (8 ассетов)

| Ассет | Таблица | GitLab API | Описание |
|-------|---------|------------|----------|
| `gitlab_commits` | commits | `/repository/commits` | Коммиты с метаданными автора |
| `gitlab_merge_requests` | project_merge_requests | `/merge_requests` | MR со статусами, рецензентами |
| `gitlab_pipelines` | project_pipelines | `/pipelines` | Пайплайны CI/CD |
| `gitlab_branches` | project_branches | `/repository/branches` | Ветки, защита, merged/unmerged |
| `gitlab_languages` | project_languages | `/languages` | Языки программирования (% по байтам) |
| `gitlab_contributors` | contributor_profiles | Агрегация из commits | Профили контрибьюторов |
| `gitlab_activity` | project_activity | Агрегация из commits/MRs/pipelines | Дневная активность |
| `gitlab_dependencies` | project_dependencies_audit | `/repository/tree` + файлы | Аудит зависимостей (npm, pip, go, cargo) |

### Обработка данных (3 ассета)

| Ассет | Описание |
|-------|----------|
| `dbt_staging` | Стандартизация: 6 staging views (stg_commits, stg_merge_requests, ...) |
| `dbt_marts` | Агрегация: 6 materialized views (mart_dashboard, mart_dora, ...) |
| `lineage_update` | Обновление метаданных lineage |

### Зависимости ассетов

```
gitlab_commits ─────────────────────────┐
gitlab_merge_requests ──────────────────┤
gitlab_pipelines ───────────────────────┤
gitlab_branches ────────────────────────┤──▶ dbt_staging ──▶ dbt_marts ──▶ lineage_update
gitlab_languages ───────────────────────┤
gitlab_contributors (deps: commits) ────┤
gitlab_activity (deps: commits,MRs,pipe)┤
gitlab_dependencies ────────────────────┘
```

## Запуск

### Автоматический (по расписанию)
- Cron: `0 */6 * * *` (каждые 6 часов)
- Настраивается в Dagster UI (`http://localhost:3001` или через `/dagster/*`)

### Ручной запуск
1. Перейти в **Данные → Сбор данных**
2. Нажать **«Собрать статистику»**
3. Статус: `POST /api/v1/dagster/trigger` → Dagster GraphQL → `launchPipelineExecution`

### CLI
```bash
docker compose --profile dagster exec dagster dagster asset materialize \
  --module-name dagster_project \
  --select "gitlab_commits,gitlab_merge_requests,gitlab_pipelines"
```

## Материализация витрин (dbt)

### Staging views (6)
Сырые данные → стандартизированные views:
- `stg_commits`, `stg_merge_requests`, `stg_pipelines`
- `stg_deployments`, `stg_branches`, `stg_contributors`

### Materialized views (6)
Агрегированные витрины с `project_id` для RBAC:
- **mart_dashboard** — KPI по проектам (коммиты, MR, деплои, пайплайны)
- **mart_dora** — DORA-метрики (частота деплоев, lead time, MTTR)
- **mart_activity** — дневная активность (коммиты, MR, пайплайны)
- **mart_contributors** — статистика по авторам
- **mart_benchmark** — сравнение по тегам
- **mart_executive_report** — сводный отчёт

### RBAC
Все витрины содержат `project_id`. API фильтрует:
```sql
WHERE project_id = ANY($1)  -- $1 = getFilteredProjectIds(userId)
```

## Rate Limiting

| Компонент | Механизм | Лимит |
|-----------|----------|-------|
| Backend (gitlab-client.ts) | Token bucket | 2 RPS |
| Dagster (helpers.py) | Retry + backoff | Не ограничен (риск) |
| GitLab API | Per-user | ~60 req/min |

При 429: retry с `Retry-After` header или exponential backoff.

## Мониторинг

- **Сбор данных** (вкладка): записи по таблицам, свежесть данных, ошибки за 24ч
- **Dagster UI**: история запусков, логи, расписание
- **Потоки данных** (lineage): визуальная карта pipeline

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| Нет новых данных | Проверить Dagster UI, нажать «Собрать статистику» |
| Ошибки в Dagster | Открыть Logs в Dagster UI, найти FAILED run |
| Витрины пустые | `docker compose --profile dagster exec dagster dbt run --select marts --full-refresh --profiles-dir /usr/app/dbt --project-dir /usr/app/dbt` |
| SIGBUS в Dagster | `docker compose --profile dagster exec dagster rm -rf /data/dagster/history` |
| Фильтры не работают | Проверить `allowed_tags` в профиле пользователя |
| 429 Too Many Requests | Подождать или уменьшить `RATE_LIMIT_RPS` |
| Ветки/языки не собираются | Проверить токен GitLab — доступ к API |
| ClickHouse недоступен | Только внутри Docker-сети, нет прямого доступа с хоста |
