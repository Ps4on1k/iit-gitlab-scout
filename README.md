# GitLab Scout

Веб-приложение для сбора и визуализации статистики из GitLab-репозиториев.

## Модули

| Вкладка | Описание |
|---------|----------|
| **Обзор** | Главный дашборд: KPI, контрибьюторы, MR, деплои, активность |
| **Аналитика** | Контрибьюторы, DORA-метрики, heatmap, deploy reliability |
| **Языки** | Сбор языков из GitLab API, визуализация соотношения |
| **Зависимости** | Аудит зависимостей, проверка актуальности версий |
| **Бенчмарк** | Сравнение проектов по тегам |
| **Данные** | Потоки данных (lineage), сбор данных (мониторинг + trigger), справочники |
| **Настройки** | Проекты, пользователи, токены, веса метрик, аудит-лог |

## Архитектура

```
┌─────────────┐     ┌──────────┐     ┌────────────┐
│  GitLab API │────▶│ Dagster  │────▶│ PostgreSQL │
└─────────────┘     │ (11 assets)│     └──────┬─────┘
                    └──────────┘            │
                         │            ┌────▼─────┐
                         │            │   dbt    │
                         │            │ (staging │
                         │            │  + marts)│
                         │            └────┬─────┘
                         │                 │
                    ┌────▼─────┐     ┌─────▼──────┐
                    │ ClickHouse│     │  Backend   │
                    │ (OLAP)    │     │  (Fastify) │
                    └──────────┘     └─────┬──────┘
                                           │
                                    ┌──────▼──────┐
                                    │  Frontend   │
                                    │ (React+Ant) │
                                    └─────────────┘
```

## Быстрый старт

```bash
git clone https://github.com/Ps4on1k/iit-gitlab-scout.git
cd iit-gitlab-scout

# Конфигурация
cp .env.example .env
# Отредактировать .env — заполнить JWT_SECRET, ENCRYPTION_KEY, GITLAB_PERSONAL_TOKEN

# Запуск
docker compose up -d

# Миграции (если нужно)
docker compose exec backend npm run migrate

# Запуск Dagster (сбор данных)
docker compose --profile dagster up -d
```

## Сервисы

| Сервис | Описание | Порт |
|--------|----------|------|
| Caddy | Reverse proxy (единственный внешний вход) | 8080 (HTTP), 8443 (HTTPS) |
| Backend | Fastify API | internal:3000 |
| Frontend | React SPA | internal:80 |
| PostgreSQL | Основная БД | internal:5432 |
| ClickHouse | OLAP аналитика | internal:8123, 9000 |
| Dagster | Оркестрация сбора | internal:3000 (UI через OAuth2 Proxy) |

## Сбор данных

Данные собираются автоматически через **Dagster** — 11 ассетов:

| Ассет | Описание |
|-------|----------|
| `gitlab_commits` | Коммиты из GitLab API |
| `gitlab_merge_requests` | Merge request'ы |
| `gitlab_pipelines` | Пайплайны CI/CD |
| `gitlab_branches` | Ветки проектов |
| `gitlab_languages` | Языки программирования |
| `gitlab_contributors` | Агрегация контрибьюторов |
| `gitlab_activity` | Дневная активность |
| `gitlab_dependencies` | Аудит зависимостей |
| `dbt_staging` | Стандартизация данных (views) |
| `dbt_marts` | Агрегация данных (materialized views) |
| `lineage_update` | Обновление метаданных lineage |

**Ручной запуск**: кнопка «Собрать статистику» в «Данные → Сбор данных»  
**Расписание**: каждые 6 часов (cron в Dagster)  
**Мониторинг**: Dagster UI через `/dagster/*` (с OAuth2 Proxy)

Подробнее: [docs/DATA_COLLECTION.md](docs/DATA_COLLECTION.md)

## SSO / Active Directory

Приложение поддерживает гибридный режим авторизации:
- **Логин/пароль** — локальные аккаунты (для администраторов)
- **OIDC SSO** — корпоративная авторизация через Azure AD, Keycloak и др.

### Настройка SSO

В `.env`:
```bash
SSO_PROVIDER=oidc
OIDC_ISSUER_URL=https://your-idp.example.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_CALLBACK_URL=https://app.example.com/api/v1/auth/sso/callback
SSO_DEFAULT_ROLE=user
```

## Учётные записи

| Логин | Пароль | Роль |
|-------|--------|------|
| `admin` | (из .env: ADMIN_PASSWORD) | Полный доступ |
| `user` | (из .env: USER_PASSWORD) | Только просмотр |

## Переменные окружения

| Переменная | Описание | По умолчанию |
|-----------|----------|--------------|
| `DATABASE_URL` | URL PostgreSQL | — |
| `JWT_SECRET` | Секрет JWT (≥16 символов) | — |
| `ENCRYPTION_KEY` | Ключ шифрования (64 hex) | — |
| `GITLAB_BASE_URL` | Base URL GitLab API | `https://gitlab.com/api/v4` |
| `GITLAB_PERSONAL_TOKEN` | Токен GitLab по умолчанию | — |
| `PORT` | Порт backend | `3000` |
| `RATE_LIMIT_RPS` | Лимит запросов/сек к GitLab | `10` (кэп 2) |
| `DATA_READ_MODE` | Режим чтения: postgresql/clickhouse/hybrid | `postgresql` |
| `SSO_PROVIDER` | Режим авторизации: local/oidc | `local` |
| `OIDC_ISSUER_URL` | URL OIDC провайдера | — |
| `OIDC_CLIENT_ID` | OIDC Client ID | — |
| `OIDC_CLIENT_SECRET` | OIDC Client Secret | — |

## Деплой

### Docker Compose (рекомендуется)

```bash
docker compose up -d                          # Основные сервисы
docker compose --profile dagster up -d        # + Dagster
docker compose exec backend npm run migrate   # Миграции
```

### Обновление

```bash
git pull
docker compose up -d --build
docker compose --profile dagster up -d --build
```

## Структура проекта

```
├── backend/                     # Fastify + TypeScript
│   ├── src/api/v1/              # API endpoints (auth, dashboard, lineage...)
│   ├── src/services/            # Сборщики данных, планировщик
│   ├── src/utils/               # Auth, cache, rate limiting, RBAC
│   ├── migrations/              # SQL миграции (001-046)
│   └── tests/                   # Vitest (55 tests)
├── frontend/                    # React + Ant Design + Vite
│   ├── src/components/          # Dashboard, Analytics, Data, Settings
│   ├── src/api/                 # API клиент
│   └── src/types/               # TypeScript типы
├── dagster/                     # Dagster оркестрация
│   ├── dagster_project/assets/  # 11 ассетов (collectors + dbt + lineage)
│   ├── dagster_project/utils/   # GitLab client, PG connection
│   └── requirements.txt         # Python зависимости (dagster, dbt-postgres)
├── dbt/                         # dbt проект
│   ├── models/staging/          # 6 staging views
│   ├── models/marts/            # 6 materialized views (с project_id)
│   └── profiles.yml             # PostgreSQL подключение
├── docker-compose.yml           # 6 сервисов + profiles (dagster, analytics)
├── Caddyfile                    # Reverse proxy
└── docs/
    └── DATA_COLLECTION.md       # Документация по сбору данных
```

## Тесты

```bash
cd backend && npm test          # 55 tests
npm run typecheck               # TypeScript проверка
```

## Лицензия

Proprietary — Инновация ИТ
