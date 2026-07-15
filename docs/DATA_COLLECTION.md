# Сбор данных

## Архитектура

```
GitLab API v4
    ↓
Dagster (коллекторы) — автоматический сбор
    ↓
PostgreSQL (сырые таблицы)
    ↓
dbt (staging → materialized views)
    ↓
Backend API (Fastify)
    ↓
Frontend (React + Ant Design)
```

## Что собирается

| Коллектор | Таблица | Описание |
|-----------|---------|----------|
| contributor-collector | commits, contributor_profiles | Коммиты и профили авторов |
| branch-collector | project_branches | Ветки проектов |
| mr-collector | project_merge_requests | Merge request'ы и одобрения |
| pipeline-collector | project_pipelines, project_deployments | Пайплайны и деплои CI/CD |
| issue-collector | project_issues | Задачи |
| stack-collector | project_languages | Языки программирования |
| activity-collector | project_activity | Дневная активность |
| dependency-audit | project_dependencies_audit | Аудит зависимостей |

## Расписание

Dagster запускает коллекторы по расписанию (cron-графики, настраиваются в Dagster UI).
По умолчанию: ежечасно.

## Ручной запуск

1. Перейти в **Данные → Сбор данных**
2. Нажать кнопку **«Собрать статистику»**
3. Мониторинг выполнения: **http://localhost:3001** (Dagster UI)

## Материализация витрин (dbt)

После сбора данных Dagster запускает dbt:
1. **Staging** —标准化原始数据 (stg_commits, stg_pipelines, и т.д.)
2. **Marts** — агрегированные витрины (mart_dashboard, mart_dora, и т.д.)

Витрины содержат `project_id` для поддержки RBAC (фильтрация по проектам).

## Витрины

| Витрина | Описание |
|---------|----------|
| mart_dashboard | Агрегированные KPI по проектам |
| mart_dora | DORA-метрики (частота деплоев, lead time, MTTR) |
| mart_activity | Дневная активность (коммиты, MR, пайплайны) |
| mart_contributors | Статистика контрибьюторов |
| mart_benchmark | Бенчмарк по тегам проектов |
| mart_executive_report | Сводный отчёт |

## RBAC (контроль доступа)

- Администраторы видят все проекты
- Обычные пользователи видят только проекты с подходящими тегами (`allowed_tags`)
- Витрины содержат `project_id`, API фильтрует по списку разрешённых проектов
- Фильтрация: `WHERE project_id = ANY($1)` в каждом API-запросе

## Rate Limiting

- **Backend (gitlab-client.ts):** Token bucket — максимум 2 RPS
- **Dagster:** Ограничен через встроенные механизмы Dagster (inter-run delay)
- При 429 (rate limit) оба клиента делают retry с exponential backoff

## Мониторинг

- **Сбор данных** (вкладка): записи по таблицам, свежесть данных, ошибки за 24ч
- **Dagster UI**: http://localhost:3001 — история запусков, логи, расписание
- **Потоки данных** (lineage): визуальная карта потока данных

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| Нет новых данных | Проверить Dagster UI: http://localhost:3001 |
| Ошибки в Dagster | Открыть Logs в Dagster UI, найти FAILED run |
| Витрины пустые | Запустить `dbt run --select marts` через Dagster |
| Фильтры не работают | Проверить allowed_tags в профиле пользователя |
| 429 Too Many Requests | Подождать или уменьшить RATE_LIMIT_RPS в .env |
