# Аудит метрик GitLab Scout — Анализ ошибок и план устранения

**Дата анализа:** 31.07.2026  
**Область:** Сбор, подготовка, хранение и отображение метрик

---

## 1. Архитектура сбора метрик

```
GitLab API v4
    │
    ▼
┌──────────────────┐     ┌──────────────────┐
│  Backend          │     │  Dagster         │
│  (Collectors)     │     │  (Assets)        │
│                   │     │                  │
│  • contributor-   │     │  • gitlab_commits│
│    collector.ts   │     │  • gitlab_merge_ │
│  • branch-        │     │    requests      │
│    collector.ts   │     │  • gitlab_       │
│  • mr-collector.ts│     │    pipelines     │
│  • pipeline-      │     │  • gitlab_       │
│    collector.ts   │     │    deployments   │
│  • activity-      │     │  • gitlab_       │
│    collector.ts   │     │    branches      │
└────────┬──────────┘     └────────┬─────────┘
         │                         │
         ▼                         ▼
    PostgreSQL (raw tables)
         │
         ├──────────────┐
         ▼              ▼
┌─────────────┐   ┌───────────┐
│ dbt marts   │   │ClickHouse │
│(materialized│   │(OLAP sync)│
│ views)      │   │           │
│             │   │           │
│mart_dashboard│  │commits    │
│mart_dora    │   │merge_     │
│mart_activity│   │ requests  │
│mart_contrib.│   │pipelines  │
└──────┬──────┘   │deployments│
       │          └───────────┘
       ▼
  Backend API (Fastify)
       │
       ▼
  Frontend (React + AntD)
```

---

## 2. Найденные ошибки

### 2.1 КРИТИЧЕСКИЕ ОШИБКИ (ломают или искажают данные)

#### БАГ-01: Дублирование коммитов — двойной сбор
**Файлы:** `contributor-collector.ts`, `branch-collector.ts`  
**Описание:** Коммиты собираются дважды:
1. `contributor-collector.ts` → собирает с `/repository/commits` (все ветки по умолчанию)
2. `branch-collector.ts` → собирает из каждой ветки (`/repository/branches` → `commit`), тоже вставляет в `commits`

Результат: один и тот же коммит попадает в БД из обоих коллекторов, но с `branch = "all"` и `branch = "main"/"feature"` соответственно. Поскольку уникальный ключ — `(project_id, commit_sha)` и стоит `ON CONFLICT DO NOTHING`, данные не задваиваются, но **branch-метки ненадёжны**: коммит из feature-ветки может быть помечен как "all", а коммит из main — с именем ветки.

**Влияние:** Метрика C5 "Direct commits в main" подсчитывает некорректно, потому что поле `branch` в таблице `commits` — это ветка из последнего коллектора, который вставил данные, а не реальная ветка коммита.

---

#### БАГ-02: Frequency JSONB — ошибка агрегации в `refreshContributors`
**Файл:** `contributor-repository.ts:68-100`  
**Описание:** Внутренний подзапрос группирует по `(project_id, author_email, author_name, additions, deletions, total_changes, committed_date)`, а `date_str` не входит в GROUP BY. Это значит, что **каждый коммит — отдельная строка**, а `cnt = 1` для каждого коммита. Затем `jsonb_object_agg(date_str, cnt)` перезаписывает дубликаты дат, оставляя `cnt=1` вместо корректного `COUNT(*)`.

**Пример:** Если автор сделал 5 коммитов в один день, `frequency["2026-07-30"]` = 1 вместо 5.

**SQL с ошибкой:**
```sql
SELECT project_id, author_email, author_name, additions, deletions, total_changes, committed_date,
       TO_CHAR(committed_date, 'YYYY-MM-DD') as date_str,
       COUNT(*) as cnt
FROM commits
WHERE project_id = $1
GROUP BY project_id, author_email, author_name, additions, deletions, total_changes, committed_date
```
GROUP BY включает additions, deletions, total_changes — разные коммиты с разными additions дают разные строки. cnt=1 всегда.

**Влияние:** Heatmap и frequency-графики показывают заниженные значения активности.

---

#### БАГ-03: RefreshContributors перезаписывает frequency за все время, а не за период
**Файл:** `contributor-repository.ts:66-103`  
**Описание:** `refreshContributors` делает `DELETE FROM contributor_profiles WHERE project_id = $1`, потом пересчитывает агрегаты из **всех** коммитов проекта. Но Dagster-ассет `gitlab_contributors` ограничивает период 90 днями (`INTERVAL '90 days'`). Это значит:
- Backend-refresh считает статистику за всё время
- Dagster-refresh считает за последние 90 дней
- После Dagster-запуска frequency показывает только 90 дней
- После backend-запуска frequency показывает всё время

**Влияние:** Картина меняется в зависимости от того, какой коллектор запускался последним. Heatmap непредсказуем.

---

#### БАГ-04: DORA MTTR — неправильный алгоритм в API
**Файл:** `dora-metrics.ts:98-110`  
**Описание:** Алгоритм MTTR ищет последний `failed` деплой, затем первый `success` после него. Но `failedStartedAt` перезаписывается при каждом новом failed, **не сбрасываясь** между парами fail→success. Если идёт: fail1, fail2, success1 — считается MTTR от fail2, а не от fail1.

Кроме того, `mttrCount` считает только деплои со статусом `status === 'failed'`, а не с `pipeline_status === 'failed'`. Несоответствие с подсчётом `failed`.

**Влияние:** MTTR занижен или неточен.

---

#### БАГ-05: DORA Deploy Frequency — несоответствие API и dbt
**Файл:** `dora-metrics.ts:96`, `mart_dora.sql:51`  
- **API:** `deployFrequency = total / days` где `days = Object.keys(dailyDeploys).length || 1` — делит на количество **дней с деплоями**, а не на количество календарных дней в периоде. Это завышает частоту.
- **dbt:** `deploy_frequency = total / 90` — делит на 90 дней что корректно для 90-дневного окна, но не адаптируется под другие периоды.
- **Интерпретация:** DORA спецификация считает "деплои в день" как `total / календарные_дни_периода`. API некорректно считает "деплои в день когда хотя бы один деплой был".

**Влияние:** Deploy frequency в API завышена в 2-10 раз.

---

#### БАГ-06: Weekly trend — пустые leadTimes/mttrMinutes
**Файл:** `dora-metrics.ts:178-193`  
**Описание:** При построении `weeklyTrend` `leadTimes` и `mttrMinutes` всегда пустые массивы (данные не переносятся из dailyTrend), но затем `avgLt` вычисляется из пустого массива как `null`, а `avgMttrMin` жёстко установлен в `null`. Это делает недельные графики бесполезными для LT и MTTR.

**Влияние:** Недельная гранулярность DORA не показывает Lead Time и MTTR.

---

#### БАГ-07: P2 Pipeline failure rate — без учёта фильтра по проектам
**Файл:** `red-flags.ts:74-82`  
**Описание:** Запрос P2 фильтрует по `created_at >= dateFrom`, но **не фильтрует по `dateTo`**. Контрибьютор-метрики (C1-C7) корректно фильтруются по обеим датам.

**Влияние:** При выборе узкого периода pipeline failure rate считается от dateFrom до NOW(), а не до dateTo.

---

#### БАГ-08: Группировка контрибьюторов по email с игнорированием Directory
**Файл:** `contributor-repository.ts:150-188`  
**Описание:** При `date_from`/`date_to` фильтрах запрос идёт напрямую в `commits` (корректно), но без фильтра `project_id` при отсутствии `project_ids`. Результат — данные **из всех проектов** агрегируются вместе.

Дополнительно, frequency JSONB из `contributor_profiles` загружается отдельным запросом per email (N+1 проблема), и при нескольких проектах на один email мерджится без учёта `project_id`.

**Влияние:** Пользователь с доступом к 1 проекту видит данные из всех проектов в вкладке "Контрибьюторы" при использовании дат фильтров.

---

#### БАГ-09: Dashboard hardcoded `mergedBranches = 0` и `mrClosed = 0`
**Файл:** `dashboard.ts:207,212`  
**Описание:** `mergedBranches` и `mrClosed` жёстко заданы в 0, хотя данные доступны в БД. Это placeholder, который не был заменён реальными запросами.

```typescript
mergedBranches: 0,  // данные есть в mart_dashboard или project_branches
mrClosed: 0,        // данные есть в project_merge_requests
```

**Влияние:** KPI-карточки Dashboard показывают 0 для merged branches и closed MRs.

---

### 2.2 СРЕДНИЕ ОШИБКИ (искажают данные в отдельных случаях)

#### БАГ-10: MR Collectors — Backend и Dagster используют разные API
**Файлы:** `mr-collector.ts`, `gitlab_assets.py:104-206`  
- **Backend:** запрашивает `merge_requests?state=all` **без фильтра по updated_after** — всегда полный сбор
- **Dagster:** использует `updated_after` с инкрементальным сбором, но с `max_pages=10` (макс 1000 MR)
- **Backend:** делает DELETE перед вставкой
- **Dagster:** делает upsert по `(project_id, gitlab_iid)`

Результат: Backend-запуск удаляет все MRs и вставляет заново. Dagster-запуск делает upsert. Если MR был удалён в GitLab — Dagster его оставит.

---

#### БАГ-11: Pipeline duration backfill — LEAD window не фильтрует по project_id
**Файл:** `pipeline-collector.ts:70-83`, `gitlab_assets.py:281-318`  
**Описание:**
```sql
WITH ranked AS (
  SELECT id, ref, created_at, status, duration,
         LEAD(created_at) OVER (PARTITION BY project_id, ref ORDER BY created_at) as next_created
  FROM project_pipelines
  WHERE project_id = $1 AND duration IS NULL AND status IN ('success', 'failed')
)
```
В Dagster-версии `WHERE` не содержит `project_id` filter:
```sql
WHERE duration IS NULL AND status IN ('success', 'failed')
```
LEAD window считает **по всем проектам одновременно**, но PARTITION BY project_id правильно разбивает. Однако **ref_avg backfill** тоже не фильтрует по project_id в Dagster:
```sql
UPDATE project_pipelines pp
SET duration = ra.avg_dur
FROM ref_avg ra
WHERE pp.ref = ra.ref AND pp.duration IS NULL AND pp.status IN ('success', 'failed')
```
Missing `AND pp.project_id = ra.project_id`.

**Влияние:** Pipeline duration может быть засемплирован из другого проекта.

---

#### БАГ-12: Red Flags C3 Bus Factor — считает по всем проектам вместе
**Файл:** `red-flags.ts:189-199`  
**Описание:** C3 bus factor считает `pct` как долю контрибьютора во **всех** коммитах (с учётом projectFilter), а не per-project. Если в фильтре 5 проектов, один контрибьютор может иметь 100% в одном проекте, но 20% в совокупности — флаг не сработает.

**Влияние:** Bus factor занижен при мультипроектном фильтре.

---

#### БАГ-13: C8 Deploy Reliability — join по author_name вместо email
**Файл:** `red-flags.ts:291-314`  
**Описание:** `mr_pipelines` JOIN по `mr.source_branch = p.ref` затем группировка по `mr.author_name` — а `author_name` не уникален между проектами/пользователями. Два разных "Maxim Rankov" в разных проектах будут слиты в одну строку.

**Влияние:** Deploy reliability данные смешиваются между однофамильцами.

---

#### БАГ-14: Activity Collector — коммиты подсчитываются через Events API
**Файл:** `activity-collector.ts`  
**Описание:** `collectActivity` использует `/events?action=pushed` который возвращает **push events**, не коммиты. `push_data.commit_count` может быть неточным (merge push может включать 100 коммитов). А Dagster-версия `gitlab_activity` агрегирует из таблицы `commits` — корректный подход.

**Влияние:** Backend activity может значительно отличаться от Dagster activity. Heatmap показывает данные из commits (верные), а activity chart — из events (неточные).

---

#### БАГ-15: Dagster Assets gitlab_commits — `max_pages=10` (лимит 1000 коммитов)
**Файл:** `gitlab_assets.py:74`  
**Описание:** `max_pages=10` в `gitlab_request_paginated` = максимум 1000 коммитов за один запуск. Для крупного репо (100k+ коммитов) первоначальный сбор соберёт только последние 1000.

Аналогично: `gitlab_merge_requests` (max_pages=10), `gitlab_pipelines` (max_pages=10), `gitlab_deployments` (max_pages=10), `gitlab_dependencies` (max_pages=5).

**Влияние:** Неполные данные в крупных проектах.

---

#### БАГ-16: Dagster Commits — branch всегда пустая строка
**Файл:** `gitlab_assets.py:84`  
**Описание:** `rows.append((..., ""))` — branch всегда `""` при вставке из Dagster. Backend `contributor-collector` ставит `"all"`, branch-collector ставит реальное имя ветки.

**Влияние:** Метрика C5 (direct commits to main) не работает с коммитами, собранными через Dagster, потому что `branch = ""` вместо `"main"`.

---

#### БАГ-17: Несоответствие обработки `changes_count` MR
**Файл:** `mr-collector.ts:44`, `gitlab_assets.py:147`  
- Backend: `parseInt(mr.changes_count, 10) || 0`
- Dagster: `int(mr["changes_count"])` с try/except

GitLab API может вернуть `changes_count` как строку "42" или "1000+". Backend делает `parseInt` что корректно для "42" но `NaN||0` для "1000+". Dagster делает `int()` что выбросит ValueError для "1000+".

**Влияние:** MR с changes_count="1000+" получают 0, что искажает метрику C4 (large MRs >500 строк).

---

### 2.3 МИНОРНЫЕ ОШИБКИ (косметические, но влияют на точность)

#### БАГ-18: Cache TTL inconsistency
**Файлы:** `red-flags.ts:393` (60s), `contributor-analytics.ts:61` (60s), `contributor-analytics.ts:317` (10s), `dora-metrics.ts` (no cache)  
**Описание:** Кэш red-flags и API-кэши фронтенда (5 мин) рассинхронизированы. Red flags показывает данные 1 мин назад, а deploy reliability — 10 сек назад. Dashboard — 60 сек.

---

#### БАГ-19: Dashboard — запрос к mart_dashboard БЕЗ date filter для топ контрибьюторов
**Файл:** `dashboard.ts:118-128`  
**Описание:** Top contributors запрашиваются из `commits` с фильтром `committed_date >= $2` (dateFrom), но `activity` historical data берётся из `mart_activity` который сам ограничен 90 днями. Несогласованность при выборе period > 90 дней.

---

#### БАГ-20: Weekly trend DORA — weekStart на Sunday
**Файл:** `dora-metrics.ts:182`  
**Описание:** `weekStart.setDate(d.getDate() - d.getDay())` считает Sunday первым днём недели. Для России (Monday first) привычнее начало недели с понедельника. Косметика, но может смущать.

---

#### БАГ-21: ClickHouse sync — contributor_profiles part_key conflict
**Файл:** `gitlab_assets.py:976`, `clickhouse/init.sql:89-101`  
**Описание:** CH `contributor_profiles` ORDER BY `(project_id, author_email)`, но синк делает INSERT (не upsert). MergeTree не дедуплицирует — при повторном синке записи удваиваются. Каждый запуск `clickhouse_sync` добавляет дубликаты.

---

#### БАГ-22: Dashboard — параметр `period` не соответствует mart_dashboard (90 дней)
**Файл:** `dashboard.ts:15,26-31,40-56`  
**Описание:** `periodDays` может быть 7, 30, 365, но `mart_dashboard` всегда считается за 90 дней (`WHERE committed_date >= current_date - interval '90 days'`). При period=7 Dashboard показывает 90-дневную сводку для summary, но 7-дневный activity chart.

---

#### БАГ-23: MR Analytics — tag поле не существует в projects
**Файл:** `pipeline-analytics.ts:127`, `mr-analytics.ts` (byProject)  
**Описание:** В `byProject.map()` используется `r.tag`, но SQL выбирает `p.tags`. Это опечатка: `tag` vs `tags`.

---

#### БАГ-24: Dagster MR — undefined encoded_path в loop
**Файл:** `gitlab_assets.py:162`  
**Описание:** Внутри вложенного цикла approvals for MRs используется `encoded_path` из внешнего цикла `for proj_id, path, token_encrypted, base_url in projects`, но при обработке item in mr_data фактически encoded_path может относиться к другому проекту (последнему в цикле). Хотя здесь это внутри того же `try` блока, проблема есть при обработке ошибок.

---

## 3. План устранения ошибок

### Фаза 1 — Критические (влияют на корректность всех метрик)

| # | Баг | Файл | Действие | Приоритет |
|---|-----|------|----------|-----------|
| 1 | БАГ-02 (frequency aggregation) | `contributor-repository.ts:68-100` | Исправить GROUP BY — группировать только по (project_id, author_email, date_str), не по additions/deletions | 🔴 P0 |
| 2 | БАГ-22 (period mismatch) | `dashboard.ts:15,26-56` | Передать periodDays в запрос mart_dashboard вместо hardcoded 90 days, или принять 90d фикс | 🔴 P0 |
| 3 | БАГ-08 (cross-project leak) | `contributor-repository.ts:150-160` | Добавить project_id filter в commitConditions при датных фильтрах, сейчас без project_ids тянет все проекты | 🔴 P0 |
| 4 | БАГ-09 (hardcoded zeros) | `dashboard.ts:207,212` | Заменить mergedBranches=0 и mrClosed=0 на реальные запросы к БД | 🔴 P0 |
| 5 | БАГ-05 (deploy frequency) | `dora-metrics.ts:96` | Исправить делитель: `periodDays` вместо `Object.keys(dailyDeploys).length` | 🔴 P0 |
| 6 | БАГ-04 (MTTR) | `dora-metrics.ts:98-110` | Переписать MTTR: итерировать fail→success пары, каждый fail имеет свою success пару | 🔴 P0 |
| 7 | БАГ-01 (dual collectors) | `contributor-collector.ts`, `branch-collector.ts` | Убрать upsertCommit из branch-collector или добавить branch-awareness в contributor-collector | 🔴 P1 |
| 8 | БАГ-16 (branch="" in Dagster) | `gitlab_assets.py:84` | Установить `branch = "all"` или получить default_branch | 🔴 P1 |

### Фаза 2 — Средние (влияют на отдельные метрики)

| # | Баг | Файл | Действие | Приоритет |
|---|-----|------|----------|-----------|
| 9 | БАГ-03 (refresh scope) | `contributor-repository.ts` + `gitlab_assets.py:467` | Унифицировать scope — всегда 90 дней или всегда всё время, синхронно между backend и Dagster | 🟡 P1 |
| 10 | БАГ-07 (P2 no dateTo) | `red-flags.ts:79-82` | Добавить `AND created_at <= $3` (dateTo) в P2 запрос | 🟡 P1 |
| 11 | БАГ-11 (cross-project refill) | `gitlab_assets.py:299-310` | Добавить `AND pp.project_id = ra.project_id` в ref_avg backfill | 🟡 P1 |
| 12 | БАГ-13 (join by name) | `red-flags.ts:301-310` | Изменить C8 group by на `mr.author_email` вместо `mr.author_name` | 🟡 P1 |
| 13 | БАГ-12 (bus factor scope) | `red-flags.ts:189-199` | Добавить project_id в C3 с per-project bus factor при мультипроекте | 🟡 P1 |
| 14 | БАГ-06 (weekly LT/MTTR) | `dora-metrics.ts:178-193` | Переносить leadTimes и mttrMinutes из dailyTrend в weeklyMap | 🟡 P1 |
| 15 | БАГ-17 (changes_count) | `mr-collector.ts:44` | Обработать строковые значения вида "1000+" через регулярку | 🟡 P2 |
| 16 | БАГ-15 (max_pages) | `gitlab_assets.py` | Увеличить max_pages или убрать лимит для первичного сбора | 🟡 P2 |
| 17 | БАГ-14 (events vs commits) | `activity-collector.ts` | Заменить Events API на SQL-агрегацию из таблицы commits | 🟡 P2 |
| 18 | БАГ-10 (MR collectors diff) | `mr-collector.ts` + `gitlab_assets.py` | Унифицировать: либо всегда full+delete, либо всегда incremental+upsert | 🟡 P2 |

### Фаза 3 — Минорные (улучшение качества)

| # | Баг | Файл | Действие | Приоритет |
|---|-----|------|----------|-----------|
| 19 | БАГ-18 (cache TTL) | несколько | Унифицировать TTL кэша на уровне config | 🟢 P3 |
| 20 | БАГ-19 (period filter) | `dashboard.ts:118-128` | Синхронизировать date range для topContributors и summary | 🟢 P3 |
| 21 | БАГ-20 (week start) | `dora-metrics.ts:182` | Сменить начало недели на понедельник | 🟢 P3 |
| 22 | БАГ-21 (CH duplicates) | `gitlab_assets.py:998-1103` | Использовать ReplacingMergeTree или TRUNCATE+INSERT для clickhouse sync | 🟢 P3 |
| 23 | БАГ-23 (tag vs tags) | `pipeline-analytics.ts:127` | Исправить `r.tag` → `r.tags` | 🟢 P3 |
| 24 | БАГ-24 (encoded_path) | `gitlab_assets.py:162` | Перенести encoded_path внутрь цикла по проектам | 🟢 P3 |