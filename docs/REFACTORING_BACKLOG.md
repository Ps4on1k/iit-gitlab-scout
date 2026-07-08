# Бэклог рефакторинга — GitLab Scout v3.2.0

> Проанализировано: **101 замечание** (13 CRITICAL, 21 HIGH, 45 MEDIUM, 22 LOW)
> Источники: анализ бэкенда (безопасность + производительность), фронтенда

---

## Приоритет 0 — CRITICAL (исправить немедленно)

### Безопасность

| # | Описание | Файл | Суть |
|---|----------|------|------|
| SEC-1 | SQL-инъекция в dependency-catalog PUT | `dependency-catalog.ts:43-48` | Ключи из `request.body` напрямую подставляются в SQL SET-клиент. Белый список допустимых колонок |
| SEC-2 | RBAC-обход: issues, dependencies, stats, contributor-resolve | `issues.ts`, `dependency-audit.ts`, `stats.ts`, `contributor-resolve.ts` | Эндпоинты используют `requireAuth`, но НЕ вызывают `getFilteredProjectIds()`. User с `allowed_tags` видит все проекты |

### Производительность

| # | Описание | Файл | Суть |
|---|----------|------|------|
| PERF-1 | N+1 API: каждый коммит = отдельный запрос | `contributor-collector.ts:52-58` | 500 коммитов = 500 API-вызовов. Параллельность + batch |
| PERF-2 | N+1 API: каждая ветка = отдельный запрос | `branch-collector.ts:62-67` | 200 веток = 200 запросов (~100 сек) |
| PERF-3 | N+1 API: каждый MR = запрос approval | `mr-collector.ts:47-54` | 300 MR = 300 запросов (~150 сек) |
| PERF-4 | N+1 DB: activity — INSERT по одной строке | `activity-collector.ts:100-108` | 730 строк = 730 запросов. Bulk INSERT |
| PERF-5 | N+1 DB: issues — INSERT по одной строке | `issue-collector.ts:37-46` | То же |
| PERF-6 | N+1 DB: pipelines — INSERT по одной строке | `pipeline-collector.ts:53-65` | То же |
| PERF-7 | N+1 DB: MR — INSERT по одной строке | `mr-collector.ts:58-72` | То же |
| PERF-8 | N+1 API+DB: dependency audit — version check + INSERT | `dependency-audit.ts:121-148` | 100 зависимостей = 100 HTTP + 100 INSERT |
| PERF-9 | N+1 API: dependency-audit — файлы | `dependency-audit.ts:69-95` | Каждый файл = отдельный GitLab API call |
| PERF-10 | N+1 DB: contributor frequency — запрос на каждого | `contributor-repository.ts:219-223` | 200 контрибьюторов = 200 доп. запросов |

### Стабильность

| # | Описание | Файл | Суть |
|---|----------|------|------|
| STAB-1 | Нет Error Boundary нигде в приложении | `App.tsx`, `main.tsx` | Ошибка рендера = белый экран. Добавить ErrorBoundary |

---

## Приоритет 1 — HIGH (очередной спринт)

### Безопасность

| # | Описание | Файл |
|---|----------|------|
| SEC-3 | Дефолтные пароли логируются в stdout | `auth.ts:29-33` |
| SEC-4 | Нет Zod-валидации на dependency-catalog PUT | `dependency-catalog.ts:42-48` |
| SEC-5 | Нет автоматического логаута при 401 на фронте | `client.ts:29-33` |
| SEC-6 | Токен в localStorage (XSS-уязвимость) | `client.ts:7-13` |
| SEC-7 | Lazy chunk load failures без обработки | `App.tsx:14-24` |

### Производительность

| # | Описание | Файл |
|---|----------|------|
| PERF-11 | Пагинация: LIMIT 99999 в commit-detail | `commit-detail.ts:52-58` |
| PERF-12 | Пагинация: нет LIMIT в issues | `issues.ts:49-56` |
| PERF-13 | Пагинация: нет LIMIT в branches | `branches.ts:124-131` |
| PERF-14 | Пагинация: нет LIMIT в dependency-audit | `dependency-audit.ts:52-58` |
| PERF-15 | Нет кэша: issues, dependencies, DORA, stack, activity | Все эндпоинты аналитики |
| PERF-16 | Dashboard: 10+ последовательных запросов | `dashboard.ts:50-240` |
| PERF-17 | contributor_directory запрашивается N раз за цикл | Множество файлов |
| PERF-18 | Scheduler: последовательная обработка проектов | `scheduler.ts:54-98` |
| PERF-19 | Нет bulk INSERT ни в одном коллекторе | Все коллекторы |
| PERF-20 | refreshContributors вызывается дважды за цикл | `contributor-repository.ts:64-102` |

### Стабильность

| # | Описание | Файл |
|---|----------|------|
| STAB-2 | Race conditions: нет AbortController | Branch, Pipeline, Dora дашборды |
| STAB-3 | Тихий swallow ошибок (catch {}) | `useCollectStatus.ts:44`, `CollectButton.tsx` |
| STAB-4 | Stale closures: loadData не мемоизирован | Pipeline, Branch, Dora дашборды |

---

## Приоритет 2 — MEDIUM (плановая работа)

### Безопасность

| # | Описание |
|---|----------|
| SEC-8 | In-memory rate limiting не переживает рестарт |
| SEC-9 | Username enumeration через разные ответы |
| SEC-10 | Ошибки в dev-режиме ликнут стек-трейсы |
| SEC-11 | DNS rebinding не защищён |
| SEC-12 | ReDoS в dependency catalog glob patterns |
| SEC-13 | COEP отключён в Helmet |
| SEC-14 | Нет валидации на personal-tokens POST |
| SEC-15 | Нет валидации project_ids в batch endpoints |

### Производительность

| # | Описание |
|---|----------|
| PERF-21 | Кэш не process-safe, нет лимита размера |
| PERF-22 | Кэш cleanup — линейный скан |
| PERF-23 | Rate limit cleanup на request path |
| PERF-24 | deleteAllProjects: 13 DELETE без транзакции |
| PERF-25 | Benchmark: N+1 query per tag (8+ запросов) |
| PERF-26 | Benchmark contributors: N+1 per email |
| PERF-27 | resolveProjectToken: 2 запроса без кэша |
| PERF-28 | getFile/requestPaginated обходят rate limiter |
| PERF-29 | dependency-audit: raw fetch без rate limiter |
| PERF-30 | getFilteredProjectIds на каждый запрос |
| PERF-31 | DORA: загружает все деплои в память |
| PERF-32 | Pipeline collector: window functions по всей таблице |
| PERF-33 | Нет мониторинга connection pool |

### Фронтенд

| # | Описание |
|---|----------|
| FE-1 | clearCache() удаляет весь кэш при смене фильтра |
| FE-2 | fetchJson/duplicated в 5+ клиентах |
| FE-3 | Raw fetch в Branch/Pipeline дашбордах |
| FE-4 | Table columns пересоздаются на каждый рендер |
| FE-5 | innerHTML с неполным escaping в отчётах |
| FE-6 | CommitPopup без abort на unmount |
| FE-7 | HeatmapChart: глобальные DOM-манипуляции |
| FE-8 | Multiple polling intervals для CollectButton |
| FE-9 | computeScore без weights в useMemo deps |
| FE-10 | filterKey JSON.stringify не мемоизирован |

---

## Приоритет 3 — LOW (backlog)

### Безопасность

| # | Описание |
|---|----------|
| SEC-16 | Fixed-window rate limiting |
| SEC-17 | CSP unsafe-inline для стилей |
| SEC-18 | Admin может удалить себя |
| SEC-19 | Нет body size limit на YAML-эндпоинты |
| SEC-20 | Нет global request timeout |

### Производительность

| # | Описание |
|---|----------|
| PERF-34 | batch-collect: хардкод 2с задержки |
| PERF-35 | stats: синхронная обработка всех проектов |
| PERF-36 | contributor-resolve: 7 последовательных запросов |
| PERF-37 | personal-tokens scan: проверка на проект |
| PERF-38 | Возможны пропущенные индексы |

### Фронтенд

| # | Описание |
|---|----------|
| FE-11 | LoginPage: polling localStorage каждые 500мс |
| FE-12 | chartColors: чтение localStorage на рендер |
| FE-13 | Мёртвый код: FilterBar.tsx, RepoInput.tsx, AnalyticsDashboard.tsx |
| FE-14 | Inline функции в onClick/onMouseEnter |

---

## Рекомендуемый порядок выполнения

### Спринт 1: Критичные исправления безопасности и стабильности
1. **SEC-1**: Исправить SQL-инъекцию в dependency-catalog (белый список колонок)
2. **SEC-2**: Добавить `getFilteredProjectIds()` в issues, dependencies, stats, contributor-resolve
3. **SEC-3**: Убрать логирование паролей
4. **STAB-1**: Добавить ErrorBoundary

### Спринт 2: Batch INSERT + параллелизм
1. **PERF-4–7**: Конвертировать все INSERT-циклы в bulk INSERT (`unnest`)
2. **PERF-1–3**: Добавить `Promise.all` с concurrency limit для GitLab API
3. **PERF-19**: Универсальная утилита batch insert

### Спринт 3: Кэширование + пагинация
1. **PERF-17**: Кэш contributor_directory (5 мин TTL)
2. **PERF-15**: Кэш для issues, DORA, activity
3. **PERF-11–14**: Добавить LIMIT/OFFSET пагинацию
4. **PERF-16**: Оптимизация dashboard (параллельные запросы)

### Спринт 4: Фронтенд
1. **FE-1**: Точечная очистка кэша вместо blanket clearCache()
2. **FE-2**: Общий fetchJson модуль
3. **FE-5**: Исправить escaping в PDF отчётах
4. **FE-6–7**: AbortController для unmount
5. **SEC-5**: Автоматический логаут при 401
6. **SEC-7**: Retry при chunk load failure

### Спринт 5: Остальное
- Rate limiting → Redis (если multi-instance)
- Scheduler: параллельная обработка с concurrency limit
- Connection pool мониторинг
- Удаление мёртвого кода
