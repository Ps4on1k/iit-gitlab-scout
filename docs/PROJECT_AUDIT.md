# Критический аудит проекта GitLab Scout

**Дата:** 03.08.2026  
**Версия:** post-7179f68 (после исправления 24 багов)  
**Статус:** Production-ready с архитектурным предупреждением

---

## 1. Обзор системы

```
GitLab API v4 (self-hosted/gitlab.com)
    │
    ├─► Backend Collectors (Node.js/TS)     ←── POST /api/v1/{collector}/collect
    │     ├── contributor-collector.ts
    │     ├── branch-collector.ts
    │     ├── mr-collector.ts
    │     ├── pipeline-collector.ts
    │     └── activity-collector.ts (SQL, fixed)
    │
    ├─► Dagster Assets (Python)              ←── cron 6h / weekly
    │     ├── gitlab_commits
    │     ├── gitlab_merge_requests
    │     ├── gitlab_pipelines
    │     ├── gitlab_branches
    │     ├── gitlab_deployments
    │     ├── gitlab_contributors (90d window)
    │     ├── gitlab_activity (from commits/MR/pipelines)
    │     ├── gitlab_dependencies
    │     ├── gitlab_dependency_audit
    │     ├── gitlab_contributor_sync
    │     └── clickhouse_sync
    │
    ▼
PostgreSQL (raw + aggregates)
    ├── commits, contributor_profiles          ←── CONFLICT: both writers
    ├── project_activity                       ←── CONFLICT: Backend SQL vs Dagster FULL JOIN
    ├── project_merge_requests / pipelines / branches / deployments
    ├── contributor_directory (YAML бизнес-справочник)
    └── dbt marts (mart_dashboard, mart_dora, mart_activity, ...)
    │
    ├──────────────┬──────────────┐
    ▼              ▼              ▼
Backend API   ClickHouse OLAP  dbt marts
(Fastify)      (init.sql)       (REFRESH materialized)
    │
    ▼
Frontend (React + AntD)
    └── Filters, Dashboards: Contributors, DORA, Red Flags,
        Activity, Branches, Pipelines, Dependencies,
        Benchmark, Executive Report, Time Entries, Settings
```

**Вывод**: Система работает, но 24 бага были найдены и исправлены в предыдущем PR. Осталась **структурная проблема**: два письменных движка (Backend + Dagster) пишут в одни таблицы с разной областью покрытия.

---

## 2. Архитектурные проблемы

### ARCH-01: Backend vs.Dagster — конфликт записи

| Таблица | Backend Collector (TS) | Dagster Asset (Python) | Хронологический итог |
|---------|----------------------|----------------------|---------------------|
| `commits` | from GitLab /commits + /branches, branch="all" | gitlab_commits branch="all" | upsert DO NOTHING — дедупликация SHA |
| `contributor_profiles` | FULL rebuild, `refreshContributors()` | DELETE + INSERT за 90 дней | **Разные данные в зависимости от планировщика** |
| `project_activity` | SQL агрегация (после фикса) | SQL FULL OUTER JOIN | **Совместимо, но логика разная** |
| `project_merge_requests` | FULL resync | incremental upsert | Разное поведение при удалении MR |
| `project_branches` | FULL resync + upsert commits | FULL resync | Разное поведение |
| `project_pipelines` | FULL resync + backfill | FULL resync | **Backfill разный** |
| `project_deployments` | внутри pipeline collector | gitlab_deployments | **raw_json сохраняется в обоих** |

**Критические последствия:**
- Если Dagster collects contributors (90d) → UI видит только 90d
- Если Backend collects (all time) → UI видит full history
- Red Flags рассчитываются на одной, потом другой — картина меняется.
- Нет единого источника истины для freshness и логики расчёта.

### ARCH-02: Dagster incremental sync с хранилищем

Dagster `gitlab_commits` использует `MAX(committed_date)` + since cursor, но если GitLab графит коммиты в будущем (редактирование даты), **инкремент не догонит настоящее**. Нет механизма разрешения будних commit timestamps.

### ARCH-03: ClickHouse лишний слой

ClickHouse sync (`clickhouse_sync`) работает по принципу INSERT-ONLY с `MergeTree`.  
При каждом синке создаются дубликаты (нет ReplacingMergeTree).  
При этом PostgreSQL используется как основной источник для UI, а ClickHouse как "счётчик статистики" — но по факту он **не используется** (проверить: ни один фронтенд роут не обращается к CH endpoints).

**Выгода CH**: быстрые OLAP-агрегации при большом объёме.  
**Риск**: дублирование данных, неконсистентность. 

---

## 3. Data Layer

### DB-01: Contributor profiles — bulk rewrite

Backend `refreshContributors()` делает:  
```
DELETE ALL → INSERT full recalc for project
```
При 500+ contributors — полная очистка таблицы при каждом pipeline run.  
Должно быть `ON CONFLICT (project_id, author_email) DO UPDATE` с INDIVIDUAL ROW.

### DB-02: Raw JSON в deployments

`project_deployments.raw_json` содержит полный ответ GitLab API — крайне полезно для debug, но безумие для стабильности схемы. Нет Zod-схемы. Нет миграции при изменении структуры.

### DB-03: No Event Sourcing

Нет истории изменений для MR/Issue states (только `updated_at`). Невозможно восстановить "`MR был год назад в review`, потом кем-то отклонён".

### DB-04: Нет дедупликации emails

contributor_directory не отслеживает изменение email одного пользователя. Если пользователь меняет email в GitLab — он создаётся как новый контрибьютор.

---

## 4. Безопасность

| Уровень | Реализация | Проблема |
|---------|-----------|----------|
| Auth | JWT 24h | Нет refresh tokens, нет revocation list |
| Token Storage | AES-256-GCM | Ключ в .env, no rotation |
| Rate Limit | In-memory 100 req/min | Не для multi-replica |
| Input Validation | Zod | Только на части endpoint'ов |
| CSP/Helmet | Есть | Нет CSP self-only, нет SRI |
| CORS | Universal (`*`) | Должно быть allowlist |
| Audit | audit_log | Без IP, без user-agent |
| Secrets | .env | Нет Vault/KMS |

---

## 5. UX/UI проблемы

| Проблема | Описание | Приоритет |
|----------|----------|-----------|
| UX-01 | Нет shareable URL — ни сохранить фильтр, ни поделиться | HIGH |
| UX-02 | Heatmap не адаптируется при deployments +50 проектов | MEDIUM |
| UX-03 | Нет onboarding для первого админа (пустые dashboards) | MEDIUM |
| UX-04 | Нет English language support | LOW |
| UX-05 | Информационная перегрузка: 12 вкладок без глобального поиска | MEDIUM |
| UX-06 | Cost of change: metric weights без version history | LOW |

---

## 6. Бэклог

### CRITICAL (≤ 1 неделя)

| ID | Задача | Причина | Статус |
|----|--------|---------|--------|
| ARCH-01 | Dagster — единственный scheduler; Backend scheduler — manual-only (default disabled) | Дублирование logic создаёт непредсказуемое поведение UI | ✅ Выполнено (migration 048) |
| SEC-01 | JWT refresh token rotation + HttpOnly cookie; logout-all revokes sessions | Утечка access token в localStorage — XSS risk | ✅ Выполнено (6e2d1c4) |
| DB-01 | ClickHouse: ReplacingMergeTree для Sync tables | Избегание дубликатов при sync | ✅ Выполнено (migration 001) |

### HIGH (≤ 1 месяц)

| ID | Задача | Причина |
|----|--------|---------|
| ARCH-02 | Route raw_json → separate S3-like storage (or GCS) для больших/MR diff объектов | PostgreSQL size growth |
| CODE-01 | Type strict: убрать `any` из API handlers (40+ мест), добавить Zod схемы для всех response | нет compile-time safety |
| TEST-01 | Unit tests для Dagster assets | Тестов нет на реальные Merge Request events
| UX-01 | URL state persistence — сохранение фильтров в URL query params | Шеринг дашбордов между пользователями невозможен |
| DB-02 | `refreshContributors` — UPSERT per row, не DELETE/INSERT | При 1M+ commits — хеллскейп | ✅ Выполнено (7179f68) |
| SEC-02 | Rate limiting на Redis (multi-replica aware) + CSRF tokens для mutation endpoints | Production readiness |

### MEDIUM (2-3 месяца)

| ID | Задача | Причина | Статус |
|----|--------|---------|--------|
| ARCH-03 | Объединить архитектуру queue: Dagster uses its own events) или удалить Backend scheduler, или заменить на Dagster Эдгар | Упрощение системы | |
| ARCH-04 | Справочник контрибьюторов — переход от email к gitlab_user_id как primary identity | Конфликт при смене email, мульти-акк | ✅ Выполнено |
| DB-03 | Audit log + user session tracking (IP, user-agent в refresh_tokens) | Investigation capability | |
| DB-04 | Email change history в contributor_directory (history table) | Teams scaling issue | |
| UX-02 | Onboarding wizard для добавления первого проекта и type | First-time experience |
| UX-03 | Modernize UI: React Query + Zustand instead of manual fetch+useState | Sverd UX + consistency |

### LOW (без сроков)

| ID | Задача | Причина |
|----|--------|---------|
| CICD-01 | Add npm audit + secret detection to pre-commit | Supply chain security |
| UX-04 | Mobile responsive design | Accessibility |
| DOC-01 | API versioning strategy (/v2/) | Future-proofing |
| DATA-01 | Retention Policy: delete commits older than N years via scheduled job | GDPR/size control |

---

## 7. Рекомендуемый Roadmap

| Что было выполнено | Отметка |
|---|---|
| 24 бага метрик | `7179f68` |
| SEC-01 — refresh tokens | `6e2d1c4` |
| ARCH-01 — manual-only scheduler | `630c564` (migration 048) |
| DB-01 — ClickHouse ReplacingMergeTree | `a713dc5` (migration 001) |
| DB-02 — refreshContributors UPSERT | `7179f68` (metrics) |
| ARCH-04 — gitlab_user_id as identity | `e0b9bce` (migration 050) |

---

| Срок | Действие |
|------|---------|
| **Неделя 1** | ARCH-01 + SEC-01 (Primary collector, JWT) |
| **Месяц 1** | ARCH-02 (event sourcing), SEC-02 (Redis), UX-01 (URL filters), CODE-01 (strict TS) |
| **Квартал 1** | ARCH-03 (унификация Dagster), UX-02 (onboarding), DB-02 (incremental refresh) |
| **Квартал 2** | UX-03 (React Query), ARCH-04 (ClickHouse RBAC), DOC-01, DATA-01 |

---

## 8. Метрики для наблюдения

- **Data Freshness**: age of last Dagster run / sync per project
- **Sync Coverage**: % of commits present in both PG and CH
- **Query Latency**: p95 for /api/v1/contributor-analytics
- **Collector Failure Rate**: Dagster failed jobs / total jobs
- **RBAC Events**: unauthorized access attempts per week
- **DORA — Frequency**: deployments/day (target 0.33)
- **DORA — Lead Time**: commit→deploy (target < 1h)
- **DORA — Failure Rate**: failed/total (target < 15%)
- **DORA — MTTR**: failure→success (target < 1h)

---

## 9. Текущие ограничения (документированные)

1. **Масштаб**: Проект известен до ~500 коммитов/day, ~50 MRs/day, ~100 pipelines/day  
2. **Хранение**: ClickHouse не используется для UI в данный момент  
3. **Локализация**: Интерфейс только на Русском  
4. **Deployment**: Подразумевается self-hosted или gitlab.com с PAT  

---

*Анализ на основе статического code review и документации. Архитектурные решения требуют валидации в контексте production load.*
