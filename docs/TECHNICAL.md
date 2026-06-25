# Техническая документация — GitLab Scout

## Обзор

GitLab Scout — веб-приложение для сбора и визуализации статистики GitLab-репозиториев. Собирает данные о контрибьюторах, активности, ветках, CI/CD пайплайнах и стеке технологий.

## Стек

- **Backend**: Fastify 5 + TypeScript, Node.js 20
- **Frontend**: React 18 + TypeScript + Vite + Ant Design 5
- **База данных**: PostgreSQL 16
- **Контейнеризация**: Docker Compose (postgres + backend + frontend/nginx)
- **Миграции**: node-pg-migrate
- **Валидация**: Zod
- **Кэширование**: In-memory (5мин TTL) + browser `cache: 'no-store'`

## Безопасность

### Аутентификация
- JWT токены (24ч), bcrypt (10 раундов)
- Эндпоинты: `/api/v1/auth/login`, `/api/v1/auth/me`

### Авторизация (RBAC)
| Роль | Просмотр | Детали | Сбор | Настройки |
|------|----------|--------|------|-----------|
| admin | ✓ | ✓ | ✓ | ✓ |
| manager | ✓ | ✓ | ✗ | ✗ |
| user | ✓ | ✗ | ✗ | ✗ |

### Шифрование
- GitLab токены: AES-256-GCM (ENCRYPTION_KEY = 64 hex chars)

### Защита
- @fastify/helmet (HSTS, CSP, X-Frame-Options, etc.)
- Rate limiting: 100 req/min/IP
- Zod-валидация входных данных
- Параметризованные SQL-запросы
- Санитизация ошибок в production

### Аудит
- Таблица `audit_log` для действий администраторов
- Логирование: login, project CRUD, user CRUD

## Архитектура API

- Префикс: `/api/v1/`
- Формат ответа: `{ ok: boolean, data?: any, error?: string }`
- Фильтрация по проектам: `tags && $1` (PostgreSQL array overlap)
- Пагинация: `limit`, `offset`
- Кэширование: `cache: 'no-store'` + `clearCache()` при фильтрации

## База данных

### Ключевые таблицы
- `projects` — GitLab проекты (path, tags[], token_encrypted)
- `app_users` — пользователи (role, allowed_tags[])
- `commits` — уникальные коммиты
- `contributor_profiles` — агрегированная статистика
- `project_branches` — ветки (UNIQUE project_id + name)
- `project_pipelines` — CI/CD пайплайны
- `project_merge_requests` — Merge Requests
- `contributor_directory` — справочник контрибьюторов
- `audit_log` — аудит-лог

### Миграции
- Формат: `NNN_name.cjs`
- Текущая: 026 (audit_log)
- Паттерн: DDL-only, без pgm.db.query() в DDL

## CI/CD

### Docker Compose
- postgres (PostgreSQL 16, volume)
- backend (Node.js 20 Alpine, healthcheck)
- frontend (Nginx + собранный React)

### Healthcheck
- `node -e "fetch('http://localhost:3000/health')"`
- `start_period: 60s`

### Планировщик
- In-process `setInterval`, polling 60с
- Задачи: collect_stack, collect_activity, collect_contributors, collect_branches, collect_pipelines, collect_merge_requests
- Минимальный интервал: 5 мин

## Контрибьюторы

### Справочник
- `contributor_directory`: display_name → emails[]
- YAML-импорт/экспорт
- Группировка статистики по display_name

### Сбор данных
- Коммиты: events API → `commits` (уникальные)
- Ветки: branches API → `project_branches`
- Коллектор веток синхронизирует коммиты → `contributor_profiles`
- Пайплайны: pipelines API → `project_pipelines`

### Метрики эффективности
- Композитная метрика 0-100: последовательность (30%), активность (25%), влияние (25%), качество (20%)

## Фронтенд

### Навигация
- Обзор → Аналитика (Контрибьюторы, Активность, Ветки, CI/CD) → Языки → Настройки

### Фильтры
- `GlobalFilterBar` — общий для аналитики
- `key` проп — ремаунт при смене фильтров
- `clearCache()` — очистка кэша

### Тёмная тема
- Toggle в хедере, `localStorage`
- Ant Design `darkAlgorithm` + кастомные токены
- CSS-переменные для кастомных элементов
- Графики: `chartColors()` — явные hex-цвета
