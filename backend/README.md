# GitLab Scout Backend

API-сервис для сбора статистики из GitLab (Fastify + TypeScript).

## Быстрый старт

```bash
npm install
cp .env.example .env
npm run migrate   # Применить миграции
npm run dev       # Запуск dev-сервера
```

## API Endpoints (34)

### Auth
- `POST /api/v1/auth/login` — JWT авторизация
- `GET /api/v1/auth/me` — данные пользователя
- `POST /api/v1/auth/change-password` — смена пароля
- `GET /api/v1/auth/sso/config` — конфигурация SSO
- `GET /api/v1/auth/sso/authorize` — OIDC redirect
- `GET /api/v1/auth/sso/callback` — OIDC callback

### Аналитика
- `GET /api/v1/dashboard` — сводный дашборд (KPI, контрибьюторы, MR, деплои)
- `GET /api/v1/contributor-analytics` — статистика контрибьюторов
- `GET /api/v1/contributor-analytics/heatmap` — тепловая карта коммитов
- `GET /api/v1/contributor-analytics/metrics` — агрегированные метрики
- `GET /api/v1/contributor-analytics/deploy-reliability` — deploy reliability
- `GET /api/v1/activity` — дневная активность
- `GET /api/v1/dora-metrics` — DORA-метрики
- `GET /api/v1/mr-analytics` — MR-аналитика (top authors/reviewers)
- `GET /api/v1/pipelines` — аналитика пайплайнов
- `GET /api/v1/branches` — анализ веток
- `GET /api/v1/benchmark` — сравнение проектов по тегам
- `GET /api/v1/red-flags` — красные флаги (аномалии проекта/контрибьюторов)

### Проекты и данные
- CRUD `/api/v1/projects` — управление проектами
- `POST /api/v1/projects/import-yaml` — YAML-импорт
- `GET /api/v1/dependencies` — аудит зависимостей
- `GET /api/v1/dependency-catalog` — справочник dependency файлов
- `GET /api/v1/dependency-audit/collect` — сбор зависимостей

### Управление
- CRUD `/api/v1/users` — управление пользователями
- `GET /api/v1/audit-log` — аудит-лог
- CRUD `/api/v1/personal-tokens` — токены GitLab
- CRUD `/api/v1/filter-presets` — сохранённые фильтры
- `GET/PUT /api/v1/metric-weights` — веса метрик

### Данные
- `GET /api/v1/data-lineage/flow` — граф потоков данных
- `GET /api/v1/data-collection/health` — здоровье данных
- `GET /api/v1/dagster/status` — статус Dagster
- `POST /api/v1/dagster/trigger` — запуск Dagster

## Структура

```
src/
├── index.ts                     # Fastify app, CORS, graceful shutdown
├── config.ts                    # Zod-валидация env
├── api/v1/
│   ├── auth.ts                  # Login/me/change-password/SSO
│   ├── projects.ts              # CRUD проектов + YAML-импорт
│   ├── dashboard.ts             # Сводный дашборд
│   ├── contributor-analytics.ts # Контрибьюторы + heatmap + deploy reliability
│   ├── red-flags.ts             # Красные флаги (аномалии)
│   ├── dora-metrics.ts          # DORA-метрики
│   ├── mr-analytics.ts          # MR-аналитика
│   ├── pipeline-analytics.ts    # Аналитика пайплайнов
│   ├── branches.ts              # Анализ веток
│   ├── benchmark.ts             # Сравнение проектов
│   ├── activity.ts              # Дневная активность
│   ├── dependency-audit.ts      # Аудит зависимостей
│   └── ... (34 endpoints)
├── services/
│   ├── gitlab-client.ts         # GitLab API клиент (rate limiting, retry)
│   ├── contributor-collector.ts # Сбор коммитов (with_stats=true)
│   ├── mr-collector.ts          # Сбор MR
│   ├── pipeline-collector.ts    # Сбор пайплайнов + deployments
│   └── branch-collector.ts      # Сбор веток
├── utils/
│   ├── auth.ts                  # JWT + requireAuth/requireAdmin
│   ├── crypto.ts                # AES-256-GCM шифрование
│   ├── cache.ts                 # In-memory кэш (TTL, LRU)
│   ├── project-filter.ts        # RBAC: getFilteredProjectIds
│   ├── project-token.ts         # Resolve token (project → personal_tokens fallback)
│   └── data-read.ts             # PostgreSQL/ClickHouse read abstraction
└── db/
    ├── pool.ts                  # pg.Pool
    ├── contributor-repository.ts # Коммиты, контрибьюторы
    └── ... (репозитории)
```

## Key Features

### Rate Limiting
- **Backend**: 2 RPS (token bucket) к GitLab API
- **Перехват 429**: retry с `Retry-After` + exponential backoff
- **Кэширование**: 60s TTL для.analytics endpoints

### RBAC
- `getFilteredProjectIds(userId)` — фильтрация по `allowed_tags`
- Тег `WHERE tags && $1` (PostgreSQL array overlap)
- Admin видит все проекты

### Кэширование
- Backend: in-memory Map, TTL 60s, LRU eviction (max 1000)
- Frontend: in-memory Map, TTL 5min
- Кэш очищается при смене фильтров

## Команды

```bash
npm run dev          # Dev-сервер (tsx watch)
npm run build        # TypeScript → dist/
npm start            # Production
npm test             # Vitest (55 tests)
npm run typecheck    # tsc --noEmit
npm run migrate      # Применить миграции
```
