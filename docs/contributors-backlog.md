# Бэклог: Аналитика контрибьюторов

> Цель: полноценная аналитика контрибьюторов с дашбордами, графиками, тепловой картой и сохранением в БД.

---

## Данные

### Модель БД

**commits** (сырые данные GitLab, для кэширования и дедупа):
- id, project_id, commit_sha (UNIQUE per project), author_name, author_email
- committed_date, additions, deletions, total_changes, branch
- raw_json (JSONB), created_at

**contributors** (агрегация по контрибьюторам):
- id, project_id, author_email, author_name
- total_commits, total_additions, total_deletions, total_changes
- first_commit_date, last_commit_date
- frequency (JSONB — {date: count})

### Дедуп по commit SHA
- При повторном анализе: пропускаем коммиты, которые уже есть в БД (UNIQUE constraint)
- Фильтруем по `since/until` только новые коммиты

---

## Метрики (из Python-проекта)

### Базовые
| Метрика | Описание |
|---------|----------|
| commits | Количество коммитов |
| additions | Добавленные строки |
| deletions | Удалённые строки |
| total_changes | additions + deletions |

### Производные
| Метрика | Формула |
|---------|---------|
| changes_per_commit | total_changes / commits |
| commits_per_day | commits / calendar_days |
| commits_per_working_day | commits / working_days |
| productivity_score | changes_per_commit × commits_per_day |
| stability_index | min(additions, deletions) / max(additions, deletions) |

---

## Фильтры

| Фильтр | Тип | Описание |
|--------|-----|----------|
| date_from | date | Начало периода |
| date_to | date | Конец периода |
| project | select | Проект (или все) |
| branch | select/regex | Ветка (exact, glob `release/*`, regex) |
| contributor | select | Контрибьютор |

---

## API Endpoints

| Endpoint | Метод | Описание |
|----------|-------|----------|
| /api/v1/contributors/collect | POST | Сбор данных из GitLab для проекта |
| /api/v1/contributors | GET | Список контрибьюторов (фильтры) |
| /api/v1/contributors/:email | GET | Профиль контрибьютора |
| /api/v1/contributors/stats | GET | Агрегированная статистика |
| /api/v1/contributors/heatmap | GET | Данные тепловой карты |
| /api/v1/contributors/metrics | GET | Производные метрики |

---

## UI — Вкладка «Контрибьюторы»

### Обзор (Dashboard)
- **KPI-карточки**: всего контрибьюторов, коммитов, additions/deletions, рабочих дней
- **График коммитов по дням** (Line/Bar chart) — Ant Design Charts
- **Топ-10 контрибьюторов** (HorizontalBar)
- **Круговая диаграмма** — распределение коммитов по проектам

### Таблица контрибьюторов
- Колонки: Автор, Коммиты, +/-, total_changes, changes_per_commit, commits_per_day, stability_index
- Сортировка по любой колонке
- Фильтр по проекту и ветке

### Тепловая карта (Heatmap)
- GitHub-style: дни × контрибьюторы/проекты
- Цветовая шкала (0 → max commits)
- Tooltip с количеством коммитов

### Профиль контрибьютора
- Имя, email, общая статистика
- График активности по времени
- Список проектов с метриками

---

## Компоненты UI (Ant Design)

| Компонент | Описание |
|-----------|----------|
| ContributorDashboard | Обзорная страница с KPI + графики |
| ContributorTable | Таблица с сортировкой и фильтрами |
| HeatmapChart | GitHub-style тепловая карта |
| CommitTimelineChart | Line/Bar chart коммитов по дням |
| ProjectPieChart | Круговая диаграмма по проектам |
| ContributorProfile | Страница контрибьютора |
| MetricsCards | Карточки KPI |

---

## Порядок реализации

| # | Задача | Статус |
|---|--------|--------|
| 1 | Миграции: commits, contributors таблицы | TODO |
| 2 | Repository: CRUD для commits/contributors | TODO |
| 3 | Collector service: сбор из GitLab + дедуп | TODO |
| 4 | Metrics service: расчёт производных метрик | TODO |
| 5 | API: endpoints /api/v1/contributors/* | TODO |
| 6 | Frontend: ContributorDashboard | TODO |
| 7 | Frontend: ContributorTable | TODO |
| 8 | Frontend: HeatmapChart | TODO |
| 9 | Frontend: CommitTimelineChart | TODO |
| 10 | Frontend: ContributorProfile | TODO |
| 11 | Тесты | TODO |
