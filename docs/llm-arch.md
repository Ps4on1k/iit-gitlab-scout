Ты — Lead Solutions Architect / Senior Fullstack Engineer (TypeScript).

Разработай современную архитектуру Fullstack-приложения для сбора и визуализации статистики из GitLab репозиториев.

ФУНКЦИОНАЛЬНЫЕ ТРЕБОВАНИЯ:

1. Сбор метрик из GitLab репозитория (через официальный GitLab API v4):
   - Контрибьюторы: количество коммитов на человека, частота коммитов (по дням/неделям/месяцам), первый и последний коммит, файлы, которые трогал каждый контрибьютор
   - Технологический стек: автоматическое определение языка, все файлы зависимостей (package.json, go.mod, requirements.txt, Cargo.toml, pom.xml, build.gradle, Gemfile, composer.json и др.), парсинг зависимостей с версиями
   - Дополнительно: количество звезд, форков, открытых/закрытых issue, активность веток

2. UI для просмотра статистики:
   - Дашборд с графиками (коммиты по времени, топ контрибьюторов)
   - Таблица зависимостей с фильтрацией по типу (prod/dev) и версиям
   - Страница детального анализа конкретного репозитория
   - Сравнение нескольких репозиториев между собой

3. Кэширование и фоновые задачи:
   - Сбор статистики занимает время — нужен фоновая обработка (job queue)
   - Результаты должны сохраняться в БД и не перезапрашиваться с GitLab при каждом просмотре
   - Автоматическое обновление данных по расписанию (например, раз в сутки)

АРХИТЕКТУРНЫЕ ТРЕБОВАНИЯ:

1. Бекенд (Node.js + TypeScript):
   - Фреймворк: выбери один из (NestJS / Fastify / Hono) — обоснуй выбор
   - Асинхронность: полное использование async/await, не блокирующий I/O
   - Взаимодействие с GitLab API: официальный @gitbeaker/rest или реализация своего клиента с rate limiting
   - Очереди задач: BullMQ (с Redis) или RabbitMQ
   - Job retry, dead-letter queue, конкуренция (concurrency control)
   - Graceful shutdown

2. Фронтенд (React/Next.js + TypeScript):
   - Фреймворк: выбери между Next.js (App Router) или Vite + React
   - Стейт-менеджмент: TanStack Query (для серверных данных) + Zustand (для локального UI состояния)
   - Визуализация данных: Recharts / Nivo / Visx
   - Таблицы: TanStack Table (гибкая, типобезопасная)
   - UI библиотека: shadcn/ui (современная, кастомная) или Mantine
   - Формы и валидация: React Hook Form + Zod

3. База данных:
   - Выбери одну из: PostgreSQL (основной вариант) или SQLite (для малых деплоев)
   - ORM: Prisma (рекомендуется) или Drizzle (легковеснее)
   - Схема БД:
     - projects (id, gitlab_url, name, last_synced_at, is_active)
     - contributors (id, project_id, name, email, gitlab_username, commits_count)
     - commits (id, project_id, contributor_id, sha, committed_at, message, files_changed)
     - dependencies (id, project_id, name, version, ecosystem, dependency_type)
     - tech_stack (id, project_id, language, framework, detected_from)

4. API дизайн (REST или GraphQL):
   - REST с возможностью GraphQL (используй GraphQL Yoga или tRPC для полной типобезопасности)
   - Я предлагаю tRPC — автоматическая типизация между бекендом и фронтендом

5. Безопасность и инфраструктура:
   - Аутентификация: передача GitLab токена от пользователя (user-scoped) или сервисный токен (project-scoped)
   - Валидация всех входных данных через Zod
   - Environment variables через Zod validation (время компиляции)
   - Rate limiting на своих API (чтобы не злоупотребляли)
   - Логирование: Pino (быстро, JSON логи)
   - Метрики: OpenTelemetry + Prometheus (опционально)

6. Запуск и разработка:
   - Docker + docker-compose для всех сервисов (app, db, redis)
   - Makefile для локальной разработки
   - Hot reload (nodemon/tsx)
   - ESLint + Prettier, Husky + lint-staged
   - GitHub Actions / GitLab CI для CI/CD

ВЫХОДНОЙ ФОРМАТ (от агента):

1. Диаграмма архитектуры (в формате Mermaid)
2. Структура проекта (дерево папок)
3. Код ключевых файлов:
   - Схема Prisma (или Drizzle)
   - GitLab клиент с retry/backoff/circuit breaker
   - Worker для сбора статистики (BullMQ processor)
   - tRPC роутер (проекты, контрибьюторы, зависимости)
   - React компонент дашборда с графиком коммитов
4. docker-compose.yml (полный)
5. .env.example
6. README.md с инструкциями
7. Примеры запросов к API и UI скриншоты (текстовым описанием)

ОГРАНИЧЕНИЯ:
- Код должен быть полностью type-safe (strict mode включен)
- Никаких any, @ts-ignore, явных приведений типов
- Все функции — pure где возможно, с минимумом side effects
- Покрытие тестами (Jest/Vitest) — хотя бы для utils и GitLab клиента