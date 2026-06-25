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
| app_users | Пользователи (role, allowed_tags) |
| contributor_profiles | Агрегированная статистика контрибьюторов |
| commits | Уникальные коммиты (SHA, author, additions/deletions) |
| project_branches | Ветки проектов |
| project_activity | Активность (коммиты/MR/пайплайны из events API) |
| project_pipelines | CI/CD пайплайны |
| project_merge_requests | Merge Requests |
| contributor_directory | Справочник контрибьюторов (display_name → emails[]) |
| scheduler_settings | Настройки планировщика |
| audit_log | Аудит-лог действий |

### 5.3 Индексы
- GIN индекс на `projects.tags` для поиска по массиву
- UNIQUE на `(project_id, name)` в `project_branches`
- UNIQUE на `(project_id, gitlab_id)` в `project_pipelines`

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
- Коммиты: из GitLab events API → `commits` таблица (уникальные)
- Ветки: из GitLab branches API → `project_branches`
- Коллектор веток синхронизирует коммиты в `commits` → `contributor_profiles`
- Пайплайны: из GitLab pipelines API → `project_pipelines`

---

## 8. CI/CD

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

## 9. Фронтенд

### 9.1 Структура навигации
- **Обзор**: сводная дашборда
- **Аналитика** (подвкладки): Контрибьюторы | Активность | Ветки | CI/CD
- **Языки**: стек технологий
- **Настройки** (admin): Проекты, Пользователи, Контрибьюторы, Периодичность, Аудит-лог

### 9.2 Фильтры
- `GlobalFilterBar` — общий для всех вкладок аналитики
- Фильтры: проекты, теги, даты, контрибьюторы
- `key` проп — принудительный ремаунт при смене фильтров
- `clearCache()` — очистка кэша при смене фильтров

### 9.3 Тёмная тема
- Toggle в хедере, `localStorage` для сохранения
- Ant Design `darkAlgorithm` + кастомные токены
- CSS-переменные для кастомных элементов
- Графики: `chartColors()` возвращает явные hex-цвета

---

## 10. Требования к новым проектам

1. **Backend**: TypeScript, Fastify, параметризованные SQL-запросы
2. **Frontend**: React + TypeScript + Ant Design
3. **БД**: PostgreSQL, миграции через node-pg-migrate
4. **Безопасность**: JWT + bcrypt, helmet, rate limiting, Zod-валидация
5. **API**: префикс `/api/v1/`, формат `{ ok: boolean, data/error }`
6. **Деплой**: Docker Compose с healthcheck
7. **Аудит**: логирование критических действий
8. **Кэширование**: `cache: 'no-store'` + `clearCache()` при фильтрации
