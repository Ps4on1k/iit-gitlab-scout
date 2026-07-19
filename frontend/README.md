# GitLab Scout Frontend

React + TypeScript + Ant Design UI для визуализации статистики GitLab.

## Быстрый старт

```bash
npm install
npm run dev    # Vite dev-server (port 5173)
```

## Структура

```
src/
├── App.tsx                      # Роутинг, auth state, навигация, sidebar
├── main.tsx                     # Entry point
├── api/
│   ├── client.ts                # API клиент (~50 функций)
│   ├── activity-client.ts       # Activity API
│   ├── pipeline-client.ts       # Pipeline API
│   └── scheduler-client.ts      # Scheduler API
├── components/
│   ├── LoginPage.tsx            # Форма входа + SSO
│   ├── GlobalFilterBar.tsx      # Общие фильтры (проекты, теги, даты)
│   ├── SettingsPanel.tsx        # Настройки (табы)
│   ├── common/
│   │   ├── ErrorBoundary.tsx    # React error boundary
│   │   ├── CollectButton.tsx    # Кнопка сбора данных
│   │   ├── SyncIndicator.tsx    # Индикатор синхронизации
│   │   └── ProjectLabel.tsx     # Название проекта с ссылкой
│   ├── contributors/
│   │   ├── ContributorDashboard.tsx  # Статистика контрибьюторов
│   │   ├── ContributorTable.tsx      # Таблица с деталями
│   │   ├── MetricsCards.tsx          # Карточки метрик
│   │   ├── HeatmapChart.tsx          # Тепловая карта коммитов
│   │   └── CommitTimelineChart.tsx   # Таймлайн коммитов
│   ├── activity/
│   │   └── ActivityDashboard.tsx     # Коммиты/MR/пайплайны по дням
│   ├── branches/
│   │   └── BranchDashboard.tsx       # Анализ веток
│   ├── pipelines/
│   │   └── PipelineDashboard.tsx     # CI/CD аналитика
│   ├── dora/
│   │   └── DoraDashboard.tsx         # DORA-метрики
│   ├── red-flags/
│   │   └── RedFlagsDashboard.tsx     # Красные флаги (аномалии)
│   ├── benchmark/
│   │   └── BenchmarkDashboard.tsx    # Сравнение проектов
│   ├── dependencies/
│   │   └── DependencyDashboard.tsx   # Аудит зависимостей
│   ├── stack/
│   │   └── StackDashboard.tsx        # Языки программирования
│   ├── data/
│   │   ├── DataLineage.tsx           # Потоки данных (SVG)
│   │   ├── DataCollectionMonitor.tsx # Мониторинг сбора
│   │   └── DataReferences.tsx        # Справочники
│   └── reports/
│       └── ReportPreview.tsx         # Executive report (PDF)
├── pages/
│   └── Dashboard.tsx                 # Главный дашборд
├── hooks/
│   ├── useCollectStatus.tsx          # Polling статуса сбора
│   └── useFilterPresets.ts           # CRUD фильтров
├── types/
│   ├── index.ts                      # Основные типы
│   ├── analytics.ts                  # Branch, Issue, Dependency, RedFlag
│   └── activity.ts                   # ActivityDay, ActivityFilters
└── utils/
    ├── cache.ts                      # In-memory кэш (TTL 5min)
    ├── theme.ts                      # Dark/Light темы Ant Design
    ├── chartTheme.ts                 # Цвета графиков
    ├── tagColors.ts                  # Цвета для тегов
    ├── projectUrl.ts                 # GitLab URL builder
    └── contributor.ts                # Resolve contributor name
```

## Вкладки

| Вкладка | Доступ | Описание |
|---------|--------|----------|
| **Обзор** | все | KPI дашборд: коммиты, контрибьюторы, MR, деплои |
| **Аналитика > Контрибьюторы** | все | Статистика, heatmap, timeline, deploy reliability |
| **Аналитика > Надёжность** | admin/manager | Deploy success rate по контрибьюторам |
| **Аналитика > Активность** | все | Коммиты/MR/пайплайны по дням/неделям |
| **Аналитика > Ветки** | все | Active/stale/merged, защита |
| **Аналитика > CI/CD** | все | Пайплайны: статистика, длительность |
| **Аналитика > DORA** | все | Deploy frequency, lead time, failure rate, MTTR |
| **Аналитика > Красные флаги** | все | Аномалии: ночные коммиты, bus factor, churn |
| **Языки** | все | Стек технологий, Pie-диаграмма |
| **Зависимости** | все | Аудит зависимостей |
| **Бенчмарк** | admin/manager | Сравнение проектов по тегам |
| **Данные** | admin | Потоки данных, сбор, справочники |
| **Настройки** | admin | Проекты, пользователи, токены |

## Key Features

### Фильтры (GlobalFilterBar)
- Проекты, теги, даты, контрибьюторы
- `key` проп на табах — ремаунт при смене фильтров
- `clearCache()` — очистка кэша при смене фильтров

### Тёмная тема
- Toggle в хедере, `localStorage` для сохранения
- Ant Design `darkAlgorithm` + кастомные токены
- CSS-переменные для кастомных элементов
- Графики: `chartColors()` возвращает hex-цвета

### Кэширование
- In-memory Map с TTL 5 минут
- `cachedGet()` для GET-запросов
- Очистка при смене фильтров

## Команды

```bash
npm run dev         # Vite dev-server
npm run build       # Production build
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
```
