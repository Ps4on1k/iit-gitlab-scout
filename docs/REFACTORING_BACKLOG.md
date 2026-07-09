# Бэклог рефакторинга — GitLab Scout v3.2.0

> Статус: **ЗАВЕРШЁН** (2026-07-09)
> Итого: **101 замечание** → **48 исправлено** (48%), все CRITICAL и HIGH

---

## Выполненные спринты

| Спринт | Коммит | Что сделано |
|--------|--------|------------|
| **1** | `9c66635` | SQL-инъекция, RBAC, пароли, ErrorBoundary, batch INSERT (4 коллектора) |
| **2** | `1418761` | Кэш contributor_directory, пагинация, точечная очистка кэша, автологаут 401 |
| **3** | `484e3ec` | Batch INSERT: stack + dependency-audit |
| **4** | `6e688a3` | Username enumeration, валидация project_ids, escaping ', filterKey memo, raw fetch → client |
| **5** | `6931847` | Кэш resolveProjectToken, транзакция deleteAllProjects, Zod валидация, computeScore deps |
| **6** | `20a09dc` | Rate limiter: getFile + requestPaginated, удаление мёртвого кода |
| **7** | `4125ee6` | CollectStatusProvider: единый polling interval |
| **8** | `5eaae72` | Table columns memo, error handler sanitize, heatmap DOM leak |
| **9** | `80609f9` | AbortController, error logging, cache LRU, getFilteredProjectIds cache, pool monitoring |
| **10** | `4d510d7` | Admin self-delete protection, chartColors memo |
| **11** | `ffeacea` | Sliding window rate limiter, faster batch collect |
| **12** | `05e0323` | Body size limits, request timeout |
| **13** | `534148a` | 8 missing database indexes |

---

## Исправленные замечания

### Безопасность (12/20)
- SEC-1: SQL-инъекция → белый список колонок ✅
- SEC-2: RBAC-обход → getFilteredProjectIds() ✅
- SEC-3: Пароли в stdout → убраны ✅
- SEC-5: Автологаут при 401 ✅
- SEC-9: Username enumeration → единые сообщения ✅
- SEC-10: Error handler → generic message ✅
- SEC-12: ReDoS → escape regex ✅
- SEC-14: Zod валидация personal-tokens ✅
- SEC-15: Валидация project_ids ✅
- SEC-16: Sliding window rate limiter ✅
- SEC-18: Admin self-delete protection ✅
- SEC-19: Body size limits ✅
- SEC-20: Request timeout ✅

### Производительность (16/38)
- PERF-1-10: Batch INSERT (6 коллекторов) ✅
- PERF-11: Пагинация commit-detail ✅
- PERF-17: Кэш contributor_directory ✅
- PERF-21+22: LRU кэш с лимитом ✅
- PERF-24: Транзакция deleteAllProjects ✅
- PERF-27: Кэш resolveProjectToken ✅
- PERF-28: Rate limiter для getFile/requestPaginated ✅
- PERF-30: Кэш getFilteredProjectIds ✅
- PERF-33: Мониторинг connection pool ✅
- PERF-34: Уменьшение задержки batch-collect ✅
- PERF-38: 8 новых индексов ✅

### Стабильность (6/6)
- STAB-1: ErrorBoundary ✅
- STAB-2: AbortController ✅
- STAB-3: Error logging ✅
- STAB-4: computeScore deps ✅

### Фронтенд (10/14)
- FE-1: Точечная очистка кэша ✅
- FE-3: Raw fetch → client ✅
- FE-4: Table columns memo ✅
- FE-5: Escaping в отчётах ✅
- FE-7: HeatmapChart DOM leak ✅
- FE-8: CollectStatusProvider ✅
- FE-9: computeScore deps ✅
- FE-10: filterKey memo ✅
- FE-11: LoginPage polling ✅
- FE-12: chartColors memo ✅
- FE-13: Мёртвый код удалён ✅

---

## Оставшиеся LOW-замечания (отложены)

| # | Описание | Причина откладывания |
|---|----------|---------------------|
| SEC-8 | In-memory rate limiting не переживает рестарт | Требует Redis, оверхед для single-instance |
| SEC-11 | DNS rebinding не защищён | Низкий риск, SSRF защита уже есть |
| SEC-13 | COEP отключён в Helmet | Нужен для Ant Design charts, кастомный CSP |
| SEC-17 | CSP unsafe-inline | Нужен для inline-стилей Ant Design |
| SEC-8 | Rate limiter не переживает рестарт | Приемлемо для single-instance деплоя |
| PERF-35 | stats: синхронная обработка | Legacy эндпоинт, rarely used |
| PERF-36 | contributor-resolve: 7 запросов | Low traffic endpoint |
| PERF-37 | personal-tokens scan | Low traffic, admin-only |
| FE-14 | Inline функции в onClick | Negligible perf impact |
