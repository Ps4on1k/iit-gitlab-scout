# GitLab Scout Backend

API-сервер для сбора статистики из GitLab.

## Быстрый старт

```bash
npm install
cp .env.example .env
# Заполнить .env

npm run migrate   # Применить миграции
npm run dev       # Запуск dev-сервера
```

## Структура

```
src/
├── index.ts                     # Fastify app, CORS, graceful shutdown
├── config.ts                    # Zod-валидация env
├── api/v1/
│   ├── auth.ts                  # Login/me
│   ├── projects.ts              # CRUD проектов + YAML-импорт
│   ├── users.ts                 # Управление пользователями
│   ├── stack-analytics.ts       # Языки программирования
│   ├── activity.ts              # Коммиты/MR/пайплайны
│   ├── contributor-analytics.ts # Контрибьюторы + heatmap
│   ├── stats.ts                 # Батч-статистика
│   └── scheduler.ts             # Настройки планировщика
├── services/
│   ├── gitlab-client.ts         # GitLab API клиент
│   ├── stack-collector.ts       # Сбор языков
│   ├── activity-collector.ts    # Сбор активности
│   └── contributor-collector.ts # Сбор контрибьюторов
├── db/
│   ├── pool.ts                  # pg.Pool (DI)
│   ├── repository.ts            # Анализ статистики
│   ├── stack-repository.ts      # Языки
│   ├── activity-repository.ts   # Активность
│   └── contributor-repository.ts # Контрибьюторы
├── models/
│   ├── gitlab.ts                # GitLab API типы
│   └── responses.ts             # API response типы
└── utils/
    ├── auth.ts                  # JWT + requireAuth/requireAdmin
    ├── crypto.ts                # AES-256-GCM шифрование
    └── password.ts              # bcrypt
```

## Команды

```bash
npm run dev          # Dev-сервер (tsx watch)
npm run build        # TypeScript → dist/
npm start            # Production
npm test             # Vitest
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run migrate      # Применить миграции
npm run migrate:down # Откатить
```

## Миграции

Файлы в `migrations/*.cjs` выполняются через `node-pg-migrate`:
- `001` — analysis_runs, project_results, contributors, dependency_files
- `002` — users (seed admin/user)
- `003` — projects (path, label, token_encrypted, base_url)
- `004` — commits, contributor_profiles (дедуп по SHA)
- `005` — app_users, tag для проектов
- `006` — project_languages
- `007` — project_activity
- `008` — scheduler_settings
