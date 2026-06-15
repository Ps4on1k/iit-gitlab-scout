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
├── App.tsx                      # Роутинг, auth state, навигация
├── main.tsx                     # Entry point
├── heatmap.css                  # CSS для тепловой карты
├── api/
│   ├── client.ts                # Auth, Projects, Users, Contributors
│   ├── stack-client.ts          # Languages API
│   ├── activity-client.ts       # Activity API
│   └── scheduler-client.ts      # Scheduler API
├── components/
│   ├── LoginPage.tsx            # Форма входа
│   ├── SettingsPanel.tsx        # Настройки (табы)
│   ├── AdminPanel.tsx           # Управление проектами + YAML
│   ├── UserManagement.tsx       # Управление пользователями
│   ├── SchedulerPanel.tsx       # Периодичность обновления
│   ├── contributors/
│   │   ├── ContributorDashboard.tsx
│   │   ├── ContributorTable.tsx
│   │   ├── MetricsCards.tsx
│   │   ├── CommitTimelineChart.tsx
│   │   └── HeatmapChart.tsx
│   ├── stack/
│   │   └── StackDashboard.tsx   # Языки + диаграммы
│   └── activity/
│       └── ActivityDashboard.tsx # Коммиты/MR/пайплайны
├── types/
│   ├── index.ts                 # Основные типы
│   ├── stack.ts                 # Типы стека
│   └── activity.ts              # Типы активности
└── utils/
    └── tagColors.ts             # Цвета для тегов
```

## Команды

```bash
npm run dev         # Vite dev-server
npm run build       # Production build
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
```

## Вкладки

| Вкладка | Доступ | Описание |
|---------|--------|----------|
| Языки | все | Стек технологий, Pie-диаграмма, полосы |
| Активность | все | Коммиты/MR/пайплайны по дням/неделям |
| Контрибьюторы | все | Статистика, тепловая карта, таймлайн |
| Настройки | admin | Проекты, Пользователи, Периодичность |
