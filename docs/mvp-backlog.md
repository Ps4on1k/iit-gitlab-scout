# MVP Backlog — IIT GitLab Scout

Цель: веб-приложение для сбора и визуализации статистики из GitLab-репозиториев через API v4.

## Структура проекта

```
iit-gitlab-scout/
├── projects.json              # Конфигурация проектов для анализа
├── migrations/                # SQL-миграции (node-pg-migrate)
│   └── 001_initial_schema.js
├── backend/                    # Node.js + Fastify + TypeScript
│   ├── src/
│   │   ├── index.ts            # Fastify app, CORS, healthcheck
│   │   ├── config.ts           # env-валидация (zod) + projects.json
│   │   ├── db/
│   │   │   ├── pool.ts         # pg.Pool, DI через getPool()
│   │   │   └── repository.ts   # параметризованные запросы
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── contributors.ts
│   │   │       ├── stack.ts
│   │   │       └── stats.ts    # batch + history
│   │   ├── services/
│   │   │   ├── gitlab-client.ts     # fetch, пагинация, rate-limit, retry
│   │   │   ├── contributor-stats.ts
│   │   │   └── stack-analyzer.ts
│   │   ├── models/
│   │   │   ├── gitlab.ts            # типы ответов GitLab API v4
│   │   │   └── responses.ts         # API response типы
│   │   └── utils/
│   │       ├── cache.ts             # TTL Map по commit SHA
│   │       └── iterators.ts         # async-итератор коммитов (100k+)
│   ├── tests/
│   │   ├── gitlab-client.test.ts
│   │   ├── contributor-stats.test.ts
│   │   ├── stack-analyzer.test.ts
│   │   └── api.test.ts
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── .env.example
│   └── README.md
├── frontend/                   # React + TypeScript + Vite
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts          # typed fetch-обёртка
│   │   ├── components/
│   │   │   ├── RepoInput.tsx
│   │   │   ├── ContributorTable.tsx
│   │   │   ├── CommitTimeline.tsx
│   │   │   ├── StackPanel.tsx
│   │   │   ├── FilterBar.tsx
│   │   │   └── ProjectCard.tsx    # карточка одного проекта
│   │   ├── pages/
│   │   │   └── Dashboard.tsx
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── README.md
├── docker-compose.yml
├── Makefile
└── README.md
```

---

## Этап 1 — каркас проекта и инфраструктура

| # | Задача | Проект | Статус |
|---|--------|--------|--------|
| 1.1 | `package.json` — зависимости: fastify, @fastify/cors, @fastify/sensible, zod, dotenv, node-fetch; devDeps: typescript, vitest, @types/node, tsx | backend | DONE |
| 1.2 | `tsconfig.json` — strict mode, paths aliases | backend | DONE |
| 1.3 | `config.ts` — zod-схема: `GITLAB_TOKEN`, `GITLAB_BASE_URL`, `REQUEST_TIMEOUT`, `RATE_LIMIT_RPS`, `CACHE_TTL`, `PORT`; валидация при старте + `getProjects()` из `projects.json` | backend | DONE |
| 1.4 | `index.ts` — Fastify app, CORS, healthcheck `GET /health`, graceful shutdown | backend | DONE |
| 1.5 | `.env.example` со всеми переменными | backend | DONE |
| 1.6 | `vitest.config.ts` — конфиг тестового раннера | backend | DONE |
| 1.7 | `Dockerfile` (multi-stage, node:20-alpine) | backend | DONE |
| 1.8 | React + Vite + TS — `npm create vite`, базовая структура | frontend | DONE |
| 1.9 | `docker-compose.yml` — backend + frontend, network | root | DONE |
| 1.10 | `projects.json` — конфиг множества проектов для анализа | root | DONE |

---

## Этап 2 — GitLab-клиент (ядро backend)

| # | Задача | Проект | Статус |
|---|--------|--------|--------|
| 2.1 | `gitlab-client.ts` — класс GitLabClient: fetch с `PRIVATE-TOKEN`, base URL из конфига | backend | TODO |
| 2.2 | Пагинация: парсинг `Link` header → auto-follow; лимит страниц — параметр | backend | TODO |
| 2.3 | Rate limiting: token-bucket алгоритм, `RATE_LIMIT_RPS` из конфига | backend | TODO |
| 2.4 | Retry: exponential backoff (3 попытки, 429/5xx), circuit breaker | backend | TODO |
| 2.5 | Timeout: AbortController + `REQUEST_TIMEOUT` на каждый запрос | backend | TODO |
| 2.6 | `iterators.ts` — async-генератор `commitIterator(projectId)`: yield коммиты по одному, не грузя все в память (для 100k+) | backend | TODO |
| 2.7 | `cache.ts` — TTLDict<T>: ключ = `string`, TTL из конфига, автоматическая инвалидация | backend | TODO |
| 2.8 | Типы: `GitLabCommit`, `GitLabProject`, `GitLabFile`, `GitLabTreeItem` (маппинг API v4 JSON) | backend | TODO |

---

## Этап 3 — бизнес-логика: контрибьюторы

| # | Задача | Проект | Статус |
|---|--------|--------|--------|
| 3.1 | `contributor-stats.ts` — `getContributorStats(projectId, filters)`: commits per author, frequency by day/week, first/last commit | backend | DONE |
| 3.2 | Фильтрация: по месяцам, контрибьюторам, проектам (query-параметры) | backend | DONE |
| 3.3 | Дифф за коммит: `GET /projects/:id/repository/commits/:sha/diff`, потоковая обработка | backend | DONE |
| 3.4 | `api/v1/contributors.ts` — `GET /api/v1/contributors?project=owner/repo&month=2024-01&author=name` | backend | DONE |

---

## Этап 4 — бизнес-логика: технологический стек

| # | Задача | Проект | Статус |
|---|--------|--------|--------|
| 4.1 | `stack-analyzer.ts` — определение основного языка (GitLab project language) | backend | DONE |
| 4.2 | Рекурсивный поиск файлов зависимостей (корень + 2 уровня): `package.json`, `go.mod`, `requirements.txt`, `Cargo.toml`, `pom.xml`, `build.gradle` и др. | backend | DONE |
| 4.3 | Парсеры для каждого типа файла → плоский список `{ name: string, version: string }` | backend | DONE |
| 4.4 | Защита: пропуск файлов > 1MB, бинарных файлов (проверка по расширению/Content-Type) | backend | DONE |
| 4.5 | `api/v1/stack.ts` — `GET /api/v1/stack?project=owner/repo` | backend | DONE |
| 4.6 | `api/v1/stats.ts` — `GET /api/v1/stats` — batch: анализ **всех** проектов из `projects.json` | backend | DONE |
| 4.7 | `config.ts` — `getProjects()`: чтение и валидация `projects.json` | backend | DONE |

---

## Этап 5 — тестирование backend

| # | Задача | Проект | Статус |
|---|--------|--------|--------|
| 5.1 | Unit-тесты `gitlab-client.test.ts`: пагинация, rate limit error, retry, timeout | backend | DONE |
| 5.2 | Unit-тесты `contributor-stats.test.ts`: мок GitLab API, проверка агрегации | backend | DONE |
| 5.3 | Unit-тесты `stack-analyzer.test.ts`: все парсеры, edge-cases (огромный lock-файл, бинарник) | backend | DONE |
| 5.4 | Integration-тест API: Fastify inject(), полный цикл contributors + stack | backend | DONE |
| 5.5 | Покрытие ≥ 80% критических путей (`vitest --coverage`) | backend | DONE |
| 5.6 | `tsc --noEmit` — чистый прогон типов | backend | DONE |

---

## Этап 6 — frontend: UI

| # | Задача | Проект | Статус |
|---|--------|--------|--------|
| 6.1 | `api/client.ts` — typed fetch + error handling, base URL из env | frontend | DONE |
| 6.2 | `types/index.ts` — TS-интерфейсы: ContributorStats, StackInfo, ProjectStats, BatchStatsResponse | frontend | DONE |
| 6.3 | `RepoInput.tsx` — поле ввода `owner/repo`, кнопка «Анализировать» | frontend | DONE |
| 6.4 | `FilterBar.tsx` — фильтры: месяц, контрибьютор | frontend | DONE |
| 6.5 | `ContributorTable.tsx` — таблица: автор, коммиты, частота, первый/последний | frontend | DONE |
| 6.6 | `CommitTimeline.tsx` — таймлайн коммитов с диффами | frontend | DONE |
| 6.7 | `StackPanel.tsx` — список зависимостей + основной язык | frontend | DONE |
| 6.8 | `Dashboard.tsx` — мультипроектный дашборд, fetchBatchStats, состояние анализа | frontend | DONE |
| 6.9 | `ProjectCard.tsx` — карточка одного проекта (контрибьюторы + стек) | frontend | DONE |
| 6.10 | `client.ts` — `fetchBatchStats()`: batch endpoint для всех проектов | frontend | DONE |

---

## Этап 7 — интеграция и деплой

| # | Задача | Проект | Статус |
|---|--------|--------|--------|
| 7.1 | CORS на backend — разрешить frontend origin | backend | DONE |
| 7.2 | `docker-compose.yml` — полная сборка, healthcheck, env | root | DONE |
| 7.3 | README.md — установка, конфигурация, запуск, примеры + projects.json | root | DONE |
| 7.4 | pre-commit: eslint + prettier (оба проекта) | root | DONE |
| 7.5 | `.dockerignore` для backend и frontend | root | DONE |

---

## Этап 8 — PostgreSQL + миграции

| # | Задача | Проект | Статус |
|---|--------|--------|--------|
| 8.1 | `config.ts` — добавить `DATABASE_URL` в zod-схему | backend | DONE |
| 8.2 | `db/pool.ts` — pg.Pool с DI через `getPool()` | backend | DONE |
| 8.3 | `db/repository.ts` — параметризованные запросы, saveAnalysisRun, getLatestRun, getRunProjects, getProjectHistory | backend | DONE |
| 8.4 | `migrations/001_initial_schema.js` — analysis_runs, project_results, contributors, dependency_files | root | DONE |
| 8.5 | `package.json` — скрипты migrate, migrate:down, migrate:create, migrate:status | backend | DONE |
| 8.6 | `api/v1/stats.ts` — batch endpoint сохраняет в БД + GET /history, GET /project-history | backend | DONE |
| 8.7 | `index.ts` — graceful shutdown: closePool() на SIGTERM/SIGINT | backend | DONE |
| 8.8 | `docker-compose.yml` — PostgreSQL 16 + healthcheck | root | DONE |
| 8.9 | `Dockerfile` — копирование migrations/, автоматический migrate при старте | backend | DONE |
| 8.10 | `.env.example`, `README.md` — документация DATABASE_URL | root | DONE |

---

## Этап 9 — Auth + RBAC

| # | Задача | Проект | Статус |
|---|--------|--------|--------|
| 9.1 | `migrations/002_create_users.js` — users таблица, user_role enum, admin/user seed | root | DONE |
| 9.2 | `utils/password.ts` — bcrypt hash/verify | backend | DONE |
| 9.3 | `utils/auth.ts` — signToken, verifyToken, requireAuth, requireAdmin middleware | backend | DONE |
| 9.4 | `api/v1/auth.ts` — POST /login, GET /me | backend | DONE |
| 9.5 | `config.ts` — JWT_SECRET, ENCRYPTION_KEY в zod-схеме | backend | DONE |
| 9.6 | Все API endpoints защищены requireAuth | backend | DONE |

---

## Этап 10 — Шифрование токенов

| # | Задача | Проект | Статус |
|---|--------|--------|--------|
| 10.1 | `utils/crypto.ts` — AES-256-GCM encrypt/decrypt | backend | DONE |
| 10.2 | Токены хранятся в `token_encrypted` (hex:iv:tag:ciphertext) | backend | DONE |
| 10.3 | Decryption только перед GitLab API запросом (stats, contributors, stack) | backend | DONE |
| 10.4 | GET /api/v1/projects/:id/token — admin only, decrypt на лету | backend | DONE |

---

## Этап 11 — Projects в БД

| # | Задача | Проект | Статус |
|---|--------|--------|--------|
| 11.1 | `migrations/003_create_projects.js` — projects таблица (path, label, token_encrypted, base_url) | root | DONE |
| 11.2 | `api/v1/projects.ts` — CRUD: list, create, update, delete (admin only) | backend | DONE |
| 11.3 | Stats endpoints читают проекты из БД вместо projects.json | backend | DONE |
| 11.4 | Contributors/stack endpoints lookup project in DB for token | backend | DONE |
| 11.5 | GITLAB_TOKEN убран из config (токены только в БД) | backend | DONE |

---

## Этап 12 — Frontend Auth + Admin

| # | Задача | Проект | Статус |
|---|--------|--------|--------|
| 12.1 | `components/LoginPage.tsx` — форма логина | frontend | DONE |
| 12.2 | `components/AdminPanel.tsx` — CRUD проектов (таблица + форма) | frontend | DONE |
| 12.3 | `api/client.ts` — token в localStorage, auth headers, login/fetchProjects/createProject/updateProject/deleteProject | frontend | DONE |
| 12.4 | `types/index.ts` — User, Role, AuthResponse, ProjectConfig | frontend | DONE |
| 12.5 | `App.tsx` — auth state, role-based tabs (Статистика / Проекты), logout | frontend | DONE |
| 12.6 | Admin tab видна только для role=admin | frontend | DONE |

---

## Деление по ролям

| Роль | Файлы |
|------|-------|
| **Backend (TypeScript)** | `backend/` — серверная логика, API, GitLab-клиент |
| **Frontend (React/TS)** | `frontend/` — UI, визуализация, fetch-клиент |
| **Инфра** | `docker-compose.yml`, `Makefile`, `README.md` в корне |

---

## Техстек (итого)

| Слой | Технологии |
|------|-----------|
| Backend API | Node.js 20, Fastify, TypeScript (strict) |
| GitLab-клиент | fetch (native), AbortController, token-bucket rate limiter |
| Кеш | In-memory Map с TTL (без внешних зависимостей) |
| Валидация | Zod (env + request params) |
| БД | PostgreSQL 16, node-pg-migrate, pg (node-postgres) |
| Миграции | node-pg-migrate, SQL-файлы в migrations/ |
| Auth | JWT (jsonwebtoken), bcryptjs, role-based (admin/user) |
| Шифрование | AES-256-GCM (node:crypto), токены в БД зашифрованы |
| Тесты | Vitest, fastify.inject() |
| Lint/Type | ESLint, Prettier, tsc --noEmit |
| Frontend | React 18, TypeScript, Vite |
| UI | Tailwind CSS или shadcn/ui (по выбору) |
| Контейнеры | Docker, docker-compose (backend + frontend + postgres) |
