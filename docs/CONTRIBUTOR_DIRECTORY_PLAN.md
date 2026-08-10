# План переработки справочника контрибьюторов

## Текущее состояние (verified 07.08.2026)

| Метрика | Значение |
|---------|----------|
| Уникальных email в коммитах | 812 |
| Email в справочнике | 774 |
| Email без справочника | 38 |
| Записей в справочнике | 696 |
| Verified записей | 696 |
| gitlab_user_id заполнено | ~0% |

## Корневые проблемы

### 1. Архитектурные
- Identity resolution один на emails[] без отдельной таблицы связей
- Нет явной связи username → contributor
- Агрессивный soundex/local-part в gitlab_contributor_sync
- Нет unique constraint на email вне зависимости от case

### 2. Текущие баги
- Duplicate entries с одинаковым display_name (разные регистры)
- mikerain объединён с другими людьми через soundex

## Новая архитектура v2

### Схема данных
```sql
-- 1. People (кто такие)
contributor_people:
  id serial PRIMARY KEY
  display_name text NOT NULL UNIQUE
  is_verified boolean DEFAULT false
  created_at timestamptz
  updated_at timestamptz

-- 2. Emails (откуда identity)
contributor_emails:
  id serial PRIMARY KEY
  person_id integer REFERENCES contributor_people(id) ON DELETE CASCADE
  email text NOT NULL
  is_primary boolean DEFAULT false
  created_at timestamptz
  
  UNIQUE INDEX ON LOWER(email)

-- 3. GitLab users (привязка к аккаунтам)
contributor_gitlab_users:
  id serial PRIMARY KEY
  person_id integer REFERENCES contributor_people(id) ON DELETE CASCADE
  gitlab_user_id integer NOT NULL
  username text NOT NULL
  gitlab_host text NOT NULL
  created_at timestamptz
  
  UNIQUE INDEX (gitlab_user_id, gitlab_host)
  UNIQUE INDEX (username, gitlab_host)
```

## Изменения по компонентам

### Backend (TS)

**1. contributor-repository.ts — refreshContributors**
```typescript
// Группируем по contributor_id (NOT display_name)
WITH resolved_commits AS (
  SELECT c.*, ce.person_id
  FROM commits c
  LEFT JOIN contributor_emails ce ON LOWER(ce.email) = LOWER(c.author_email)
)
INSERT INTO contributor_profiles
SELECT 
  project_id,
  COALESCE(person_id::text, author_email) as contributor_key,
  COALESCE(p.display_name, author_name) as author_name,
  ...aggregates
GROUP BY project_id, contributor_key, author_name
```

**2. contributor-repository.ts — getContributors**  
- GROUP BY contributor_id
- Если contributor_id NULL → fallback → join person via email

**3. contributor-directory.ts**
- POST /validate — проверить конфликты emails
- POST /link — перелинковать email between contributors
- GET /conflicts — список конфликтных email

### Dagster (Python)

**gitlab_contributor_sync**
- Убрать soundex/local-part matching
- Использовать только exact match по username или email
- Manual linking через UI/API для сложных случаев

### Frontend

- Фильтрация по display_name (не email)
- Профиль пользователя: все emails + gitlab usernames
- Интерфейс для manual linking
- «Merge» функция для дублирующихся записей

## Plan миграции

```
052_create_contributor_people.cjs:
  - CREATE TABLE contributor_people
  - CREATE TABLE contributor_emails  
  - CREATE TABLE contributor_gitlab_users
  - Migrate data from contributor_directory
  - CREATE UNIQUE INDEXES

053_drop_old_directory.cjs (после verify)
```

## Что может сломаться

| Компонент | Риск | Митигация |
|-----------|------|-----------|
| getContributors | GROUP BY сменится | Тесты переписать |
| Frontend display_name | Возвращает другое поле | API contract тот же |
| Heatmap | grouping key изменится | Aggregate per contributor_id |
| MR stats | author_username → contributor | Новый resolver |

## Timeline

| Phase | Work | Effort |
|-------|------|--------|
| 1 | Schema design + migration | 2 h |
| 2 | Backend: refreshContributors, getContributors | 4 h |
| 3 | Dagster: gitlab_contributor_sync | 2 h |
| 4 | Frontend: UI linking | 4 h |
| 5 | Testing + fixes | 2 h |
| **Total** | | **14 h** |

## Do this now first

1. Verify всех данных в справочнике (is_valid)
2. Fix duplicate emails через mergeUI
3. После этого — schema refactor

## Отказ от gitlab_user_id resolution

**Невозможно** в GitLab CE:
- /users/:id — 403 Forbidden
- web_url содержит username (можно использовать)
- GitLab Community не разрешает API доступ к user email

**Решение:** Сохраняем оба идентификатора, но объединяем только через справочник