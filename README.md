# GitLab Scout v3.4.0

Веб-приложение для сбора и визуализации статистики из GitLab-репозиториев.

## Модули

| Вкладка | Описание |
|---------|----------|
| **Обзор** | Главный дашборд: KPI, контрибьюторы, MR, деплои, активность |
| **Аналитика > Контрибьюторы** | Статистика контрибьюторов, heatmap, эффективность |
| **Аналитика > Надёжность** | Deploy reliability —成功率 пайплайнов по контрибьюторам |
| **Аналитика > Активность** | Дневная/недельная активность, MR по проектам |
| **Аналитика > Ветки** | Анализ веток: active/stale/merged, защита |
| **Аналитика > CI/CD** | Пайплайны: статистика, длительность, распределение |
| **Аналитика > DORA** | DORA-метрики: deploy frequency, lead time, failure rate, MTTR |
| **Аналитика > Красные флаги** | Аномалии в проекте и контрибьюторах (ночные коммиты, bus factor, churn) |
| **Языки** | Сбор языков из GitLab API, визуализация соотношения |
| **Зависимости** | Аудит зависимостей, проверка актуальности версий |
| **Бенчмарк** | Сравнение проектов по тегам (DORA, коммиты, MR, пайплайны) |
| **Данные** | Потоки данных (lineage), сбор данных (мониторинг), справочники |
| **Настройки** | Проекты, пользователи, токены, веса метрик, аудит-лог |

## Архитектура

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│  GitLab API │────▶│    Dagster   │────▶│ PostgreSQL │
│  (v4, Rate  │     │  14 ассетов  │     │   (16+)    │
│   Limited)  │     │  2 schedules │     └──────┬─────┘
└─────────────┘     └──────────────┘            │
                                                │
                              ┌─────────────────┼─────────────────┐
                              │                 │                 │
                        ┌─────▼──────┐   ┌─────▼──────┐   ┌─────▼──────┐
                        │    dbt     │   │   Backend  │   │  Frontend  │
                        │ staging +  │   │  (Fastify) │   │ (React +   │
                        │ marts (6)  │   │  34 routes │   │ Ant Design)│
                        └────────────┘   └────────────┘   └────────────┘
                                                │
                                         ┌──────▼──────┐
                                         │    Caddy    │
                                         │  (Reverse   │
                                         │   Proxy)    │
                                         └─────────────┘
```

## Быстрый старт

```bash
git clone https://github.com/Ps4on1k/iit-gitlab-scout.git
cd iit-gitlab-scout

# Конфигурация
cp .env.example .env
# Отредактировать .env — заполнить JWT_SECRET, ENCRYPTION_KEY, GITLAB_PERSONAL_TOKEN

# Запуск основных сервисов
docker compose up -d

# Запуск Dagster (сбор данных)
docker compose --profile dagster up -d
```

## Сервисы

| Сервис | Описание | Порт |
|--------|----------|------|
| Caddy | Reverse proxy (единственный внешний вход) | 8080 (HTTP), 8443 (HTTPS) |
| Backend | Fastify API (34 эндпоинта) | internal:3000 |
| Frontend | React SPA (14 страниц) | internal:80 |
| PostgreSQL | Основная БД + витрины | internal:5432 |
| Dagster | Оркестрация сбора данных | 3001 (UI) |

## Сбор данных

Данные собираются автоматически через **Dagster** — 14 ассетов по 2 расписаниям:

### Основной сбор (каждые 6 часов)

| Ассет | Описание |
|-------|----------|
| `gitlab_commits` | Коммиты с stats (additions/deletions) |
| `gitlab_merge_requests` | MR с reviewers (per-MR approvals) |
| `gitlab_pipelines` | Пайплайны + duration backfill |
| `gitlab_branches` | Ветки с last_commit_date |
| `gitlab_issues` | Issues проектов |
| `gitlab_deployments` | Деплои с raw_json (для DORA lead time) |
| `gitlab_contributors` | Агрегация контрибьюторов из коммитов |
| `gitlab_activity` | Дневная активность (коммиты + MR + пайплайны) |

### Еженедельный сбор (воскресенье 02:00 UTC)

| Ассет | Описание |
|-------|----------|
| `gitlab_dependencies` | Сбор зависимостей из repository tree |
| `gitlab_dependency_audit` | Проверка актуальности через npm/pypi/go APIs |
| `gitlab_languages` | Языки программирования |
| `clickhouse_sync` | Синхронизация в ClickHouse (опционально) |

### Инкрементальный сбор

Каждый ассет определяет последнюю дату сбора из БД и запрашивает только новые данные:
- Commits: `?since=<last_date>`
- MR: `?updated_after=<last_date>`
- Pipelines: `?updated_after=<last_date>`
- Deployments: `?updated_after=<last_date>`
- Branches, Languages, Dependencies: полный сбор (DELETE + INSERT)

### Rate limiting

- GitLab API: 1 запрос/сек + random jitter (0–1с)
- 429 ответ: retry с `Retry-After` header
- Повторные запросы: exponential backoff (3 попытки)

Подробнее: [docs/DATA_COLLECTION.md](docs/DATA_COLLECTION.md)

## Красные флаги

Раздел «Аналитика > Красные флаги» показывает проблемные места:

### Метрики проекта
- Застаревшие ветки (>90 дней без коммитов)
- Падение пайплайнов (% failed)
- MR без ревью (без reviewers)
- Долгоживущие MR (>14 дней)
- Низкая частота деплоев

### Метрики контрибьютора
- Ночные коммиты (20:00–08:00 MSK)
- Пропуск жёлтой зоны (16:00–19:00 MSK)
- Bus factor (>70% коммитов от одного)
- Churn (>40% дней с нулевым net changes)
- Direct commits в main (обход code review)
- Инвеща (контрибьютор исчез)

### Система оценки
Красный = 3 балла, жёлтый = 1 балл. Контрибьюторы сортируются по убыванию.

## SSO / Active Directory

Гибридный режим: локальные пароли + OIDC SSO.

```bash
# .env
SSO_PROVIDER=oidc
OIDC_ISSUER_URL=https://keycloak.example.com/realms/master
OIDC_CLIENT_ID=gitlab-scout
OIDC_CLIENT_SECRET=...
OIDC_CALLBACK_URL=https://app.example.com/api/v1/auth/sso/callback
```

Дагстер защищён через OAuth2 Proxy (Keycloak → Caddy → Dagster).

## Переменные окружения

| Переменная | Описание | По умолчанию |
|-----------|----------|--------------|
| `DATABASE_URL` | URL PostgreSQL | — |
| `JWT_SECRET` | Секрет JWT (≥16 символов) | — |
| `ENCRYPTION_KEY` | Ключ шифрования (64 hex) | — |
| `GITLAB_BASE_URL` | Base URL GitLab API | `https://gitlab.com/api/v4` |
| `GITLAB_PERSONAL_TOKEN` | Токен GitLab по умолчанию | — |
| `PORT` | Порт backend | `3000` |
| `RATE_LIMIT_RPS` | Лимит запросов/сек к GitLab | `2` |
| `SSO_PROVIDER` | Режим авторизации: local/oidc | `local` |
| `ADMIN_PASSWORD` | Пароль admin (генерируется если пусто) | random |
| `USER_PASSWORD` | Пароль user (генерируется если пусто) | random |

## Структура проекта

```
├── backend/                     # Fastify + TypeScript
│   ├── src/api/v1/              # 34 API endpoints
│   ├── src/services/            # GitLab client, collectors
│   ├── src/utils/               # Auth, cache, RBAC, crypto
│   └── migrations/              # 47 SQL миграций
├── frontend/                    # React + Ant Design + Vite
│   ├── src/components/          # 14 dashboard-компонентов
│   ├── src/api/                 # API клиент
│   └── src/types/               # TypeScript типы
├── dagster/                     # Dagster оркестрация
│   ├── dagster_project/assets/  # 14 ассетов
│   ├── dagster_project/utils/   # GitLab client, PG, rate limiting
│   └── requirements.txt         # Python зависимости
├── dbt/                         # dbt проект
│   ├── models/staging/          # 6 staging views
│   └── models/marts/            # 6 materialized views
├── docker-compose.yml           # 5 сервисов
├── Caddyfile                    # Reverse proxy
└── docs/
    ├── DATA_COLLECTION.md       # Документация по сбору данных
    ├── ARCHITECTURE.md          # Архитектура и паттерны
    └── TECHNICAL.md             # Техническая документация
```

## Тесты

```bash
cd backend && npm test          # 55 tests
npm run typecheck               # TypeScript проверка
```

## Лицензия

Proprietary — Инновация ИТ
