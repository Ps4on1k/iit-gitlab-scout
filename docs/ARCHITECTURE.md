# Архитектура и правила проектирования

Набор правил и паттернов для новых проектов на стеке Fastify + React + PostgreSQL.

---

## 1. Стек технологий

| Слой | Технология | Версия |
|------|-----------|--------|
| Backend | Fastify + TypeScript | 5.x |
| Frontend | React + TypeScript + Vite | 18+ |
| UI-библиотека | Ant Design | 5.x |
| База данных | PostgreSQL | 16+ |
| Миграции | node-pg-migrate | — |
| Валидация | Zod | 3.x |
| Контейнеризация | Docker Compose | — |

---

## 2. Структура проекта

```
project/
├── backend/
│   ├── src/
│   │   ├── api/v1/          # API эндпоинты
│   │   ├── db/              # Репозитории, пул соединений
│   │   ├── services/        # Бизнес-логика, коллекторы
│   │   ├── utils/           # Auth, крипто, валидация, аудит
│   │   └── index.ts         # Точка входа
│   ├── migrations/          # SQL миграции (node-pg-migrate)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/             # API клиенты
│   │   ├── components/      # React компоненты
│   │   ├── pages/           # Страницы (Dashboard)
│   │   ├── types/           # TypeScript интерфейсы
│   │   └── utils/           # Утилиты (кеш, тема, цвета)
│   └── package.json
├── docker-compose.yml
├── .env
└── docs/
```

---

## 3. Безопасность (OWASP Top 10)

### 3.1 Аутентификация
- **JWT токены** с 24ч истечением
- **bcrypt** для хэширования паролей (10 раундов)
- Токены не логируются
- Два эндпоинта: `/api/v1/auth/login` и `/api/v1/auth/me`

### 3.2 Авторизация (RBAC)
- Три роли: `admin`, `manager`, `user`
- `admin` — полный доступ (CRUD, сбор данных, настройки)
- `manager` — просмотр + детальные данные, без сбора
- `user` — только просмотр
- Middleware: `requireAuth` (любая роль), `requireAdmin` (только admin)
- Ограничение видимости проектов через `allowed_tags`

### 3.3 Шифрование
- GitLab токены: **AES-256-GCM** (ENCRYPTION_KEY в .env)
- Формат: `hex(iv):hex(tag):hex(ciphertext)`
- Дешифрование только при запросе к GitLab API

### 3.4 Защита сервера
- **@fastify/helmet**: HSTS, X-Frame-Options, CSP, X-Content-Type-Options
- **Rate limiting**: 100 запросов/мин на IP (in-memory)
- **Санитизация ошибок**: стек-трейсы скрыты в production
- **Валидация ввода**: Zod-схемы для всех критических эндпоинтов
- **SQL инъекции**: параметризованные запросы PostgreSQL

### 3.5 Аудит
- Таблица `audit_log` (user_id, action, details, created_at)
- Логирование: login (успех/неуспех), CRUD проектов/пользователей
- API: `GET /api/v1/audit-log` с фильтрацией и пагинацией

---

## 4. Архитектура API

### 4.1 Префикс
Все эндпоинты под `/api/v1/`.

### 4.2 Паттерн ответа
```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": "Сообщение" }
```

### 4.3 Пагинация
- `limit` и `offset` как query-параметры
- Ответ содержит `data` и `total`

### 4.4 Фильтрация
- `project_ids` — запятая разделённые ID
- `tags` — запятая разделённые теги
- `date_from`, `date_to` — формат YYYY-MM-DD
- Доступ к проектам: проверка через `allowed_tags` пользователя

### 4.5 Кэширование
- Frontend: in-memory кэш с TTL 5 минут (utils/cache.ts)
- При смене фильтров: `clearCache()` + `key` проп на табах
- Запросы: `cache: 'no-store'` для предотвращения браузерного кэширования

---

## 5. База данных

### 5.1 Миграции
- Формат: `NNN_name.cjs` (node-pg-migrate)
- Порядок: только вверх (без опасных DDL в миграциях)
- Каждая миграция: `exports.up` и `exports.down`

### 5.2 Таблицы
| Таблица | Назначение |
|---------|-----------|
| projects | Проекты GitLab (path, tags, token_encrypted) |
| app_users | Пользователи (role, allowed_tags, external_provider) |
| commits | Коммиты (SHA, author, additions/deletions, committed_date) |
| contributor_profiles | Агрегированная статистика контрибьюторов (frequency JSONB) |
| contributor_directory | Справочник контрибьюторов (display_name → emails[]) |
| project_branches | Ветки проектов (last_commit_date, merged, protected) |
| project_merge_requests | Merge Requests (reviewers[], approvals, changes_count) |
| project_pipelines | CI/CD пайплайны (duration, status, ref) |
| project_deployments | Деплои (raw_json для DORA lead time) |
| project_issues | Issues проектов |
| project_activity | Дневная активность (коммиты + MR + пайплайны) |
| project_languages | Языки программирования |
| project_dependencies_audit | Аудит зависимостей (is_outdated) |
| dependency_catalog | Справочник dependency файлов (80 записей) |
| personal_tokens | Токены GitLab (AES-256-GCM) |
| scheduler_settings | Настройки планировщика |
| scheduler_errors | Ошибки сбора данных |
| audit_log | Аудит-лог действий |
| filter_presets | Сохранённые фильтры |
| metric_weights | Веса метрик для scoring |
| lineage_metadata | Метаданные lineage графа |

### 5.3 Materialized Views (dbt)
| Витрина | Назначение |
|---------|-----------|
| mart_dashboard | KPI по проектам (коммиты, MR, деплои, пайплайны) |
| mart_dora | DORA-метрики (deploy frequency, failure rate, lead time, MTTR) |
| mart_activity | Дневная активность (коммиты + MR + пайплайны) |
| mart_contributors | Статистика по авторам (commits, changes, active_days) |
| mart_benchmark | Сравнение проектов по тегам |
| mart_executive_report | Сводный отчёт (всё в одном) |

### 5.4 Индексы
- GIN индекс на `projects.tags` для поиска по массиву
- UNIQUE на `(project_id, name)` в `project_branches`
- UNIQUE на `(project_id, gitlab_id)` в `project_pipelines`
- UNIQUE на `(project_id, gitlab_iid)` в `project_merge_requests`
- UNIQUE на `(project_id, gitlab_deployment_id)` в `project_deployments`
- UNIQUE на `(project_id, author_email)` в `contributor_profiles`
- INDEX на `commits(project_id, committed_date)` для датных фильтров

---

## 6. Авторизация и управление доступом

### 6.1 JWT Flow
1. POST `/api/v1/auth/login` → JWT token (24ч)
2. Все запросы: `Authorization: Bearer <token>`
3. GET `/api/v1/auth/me` → данные пользователя + allowed_tags

### 6.2 RBAC Middleware
```typescript
requireAuth — проверяет JWT
requireAdmin — проверяет JWT + роль admin
```

### 6.3 Фильтрация проектов по тегам
- `projects.tags` (text[]) — теги проекта
- `app_users.allowed_tags` (text[]) — разрешённые теги
- SQL: `WHERE tags && $1` (overlap operator PostgreSQL)
- User видит проект если ЕСТЬ ХОТЯ БЫ ОДИН общий тег
- Admin видит все проекты

---

## 7. Контрибьюторы и справочник

### 7.1 Группировка
- Таблица `contributor_directory`: display_name → emails[]
- Статистика группируется по display_name
- Если нет в справочнике — отображается по email
- YAML-импорт/экспорт

### 7.2 Сбор данных
- Коммиты: из GitLab API (with_stats=true) → `commits` таблица (уникальные, upsert)
- MR: из GitLab API + per-MR approvals → `project_merge_requests` (reviewers, changes_count)
- Ветки: из GitLab API (with_stats=true) → `project_branches` (last_commit_date из commit объекта)
- Пайплайны: из GitLab API → `project_pipelines` + duration backfill (LEAD window + ref avg)
- Деплои: из GitLab API → `project_deployments` + raw_json (для DORA lead time)

---

## 8. Красные флаги

### 8.1 API Endpoint
`GET /api/v1/red-flags` — расширенный endpoint с метриками проекта и контрибьюторов.

### 8.2 Метрики проекта (P1–P6)

| # | Метрика | Источник | Порог красный | Порог жёлтый |
|---|---------|----------|---------------|--------------|
| P1 | Застаревшие ветки | `project_branches` | >30% | >15% |
| P2 | Падение пайплайнов | `project_pipelines` | >40% failed | >20% failed |
| P3 | MR без ревью | `project_merge_requests` | >50% без reviewers | >20% |
| P4 | Долгоживущие MR | `project_merge_requests` | >10 MR >14д | >3 MR >14д |
| P5 | Низкая частота деплоев | `project_deployments` | <1/мес | <2/мес |
| P6 | Нет деплоев | `project_deployments` | 0 за период | — |

### 8.3 Метрики контрибьютора (C1–C7)

| # | Метрика | Источник | Порог красный | Порог жёлтый |
|---|---------|----------|---------------|--------------|
| C1 | Ночные коммиты | `commits` | >25% | >10% |
| C2 | Пропуск жёлтой зоны | `commits` | >50% дней | >25% дней |
| C3 | Bus factor | `commits` | >70% проекта | >50% проекта |
| C4 | Крупные MR | `project_merge_requests` | >3 MR >500 строк | >1 MR |
| C5 | Direct commits в main | `commits` | >5 коммитов | >2 коммита |
| C6 | Инвеща | `commits` | Исчез в первые 50% | Исчез в первые 75% |
| C7 | High churn | `commits` | >40% дней net=0 | >25% дней net=0 |

### 8.4 Система оценки
- Красный порог = 3 балла
- Жёлтый порог = 1 балл
- Зелёный = 0 баллов
- Контрибьюторы сортируются по убыванию суммы баллов
- Оценка >= 6: критично (требует внимания)
- Оценка >= 2: предупреждение (стоит проверить)

---

## 9. CI/CD

### 8.1 Docker Compose
- postgres (PostgreSQL 16)
- backend (Node.js 20 Alpine)
- frontend (Nginx + собранный React)

### 8.2 Healthcheck
- `node -e "fetch('http://localhost:3000/health')"` — Alpine busybox unreliable
- `start_period: 60s` для прогрева миграций

### 8.3 Планировщик
- In-process `setInterval`, polling каждые 60с
- Задачи: collect_stack, collect_activity, collect_contributors, collect_branches, collect_pipelines
- Интервалы настраиваются через UI (мин 5 мин)

---

## 10. Фронтенд

### 10.1 Структура навигации
- **Обзор**: сводная дашборда
- **Аналитика** (подвкладки): Контрибьюторы | Надёжность | Активность | Ветки | CI/CD | DORA | Красные флаги
- **Языки**: стек технологий
- **Зависимости**: аудит зависимостей
- **Бенчмарк**: сравнение проектов (admin/manager)
- **Настройки** (admin): Проекты, Пользователи, Токены, Аудит-лог

### 10.2 Фильтры
- `GlobalFilterBar` — общий для всех вкладок аналитики
- Фильтры: проекты, теги, даты, контрибьюторы
- `key` проп — принудительный ремаунт при смене фильтров
- `clearCache()` — очистка кэша при смене фильтров

### 10.3 Тёмная тема
- Toggle в хедере, `localStorage` для сохранения
- Ant Design `darkAlgorithm` + кастомные токены
- CSS-переменные для кастомных элементов
- Графики: `chartColors()` возвращает явные hex-цвета

---

## 11. Требования к новым проектам

1. **Backend**: TypeScript, Fastify, параметризованные SQL-запросы
2. **Frontend**: React + TypeScript + Ant Design
3. **БД**: PostgreSQL, миграции через node-pg-migrate
4. **Безопасность**: JWT + bcrypt, helmet, rate limiting, Zod-валидация
5. **API**: префикс `/api/v1/`, формат `{ ok: boolean, data/error }`
6. **Деплой**: Docker Compose с healthcheck
7. **Аудит**: логирование критических действий
8. **Кэширование**: `cache: 'no-store'` + `clearCache()` при фильтрации
